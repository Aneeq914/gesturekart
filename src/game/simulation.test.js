import { describe, expect, it } from 'vitest'
import {
  BRAKE_DECEL,
  CRUISE_SPEED,
  EVENT,
  LANES,
  LIGHT_GREEN_AFTER_STOP,
  LIGHT_RED_AT,
  OBSTACLE_MIN_GAP,
  START_LANE,
} from './rules.js'
import { SIM, createWorld, gapToNearestStopLine, resetWorld, stepWorld } from './simulation.js'

const DT = 1 / 60
const ALWAYS_RED = () => 0
const ALWAYS_GREEN = () => 0.99
const HALF = SIM.CAR_LENGTH / 2

// Step until `until(world)` is true (or maxSeconds pass). Returns collected events.
function run(world, { action = 'none', until = () => false, maxSeconds = 60 } = {}) {
  const events = []
  for (let i = 0; i < maxSeconds / DT; i++) {
    const a = typeof action === 'function' ? action(world) : action
    events.push(...stepWorld(world, DT, a))
    if (until(world, events)) break
  }
  return events
}

const count = (events, type) => events.filter((e) => e === type).length
const front = (w) => w.distance + HALF

describe('lane change', () => {
  it('is edge-triggered: a held lean moves exactly one lane', () => {
    const w = createWorld(ALWAYS_GREEN, { obstacles: false })
    expect(w.laneIndex).toBe(START_LANE)
    run(w, { action: 'left', maxSeconds: 1 })
    expect(w.laneIndex).toBe(START_LANE - 1)
    run(w, { action: 'none', maxSeconds: 0.2 })
    run(w, { action: 'right', maxSeconds: 1 })
    expect(w.laneIndex).toBe(START_LANE)
  })

  it('clamps to the outer lanes', () => {
    const w = createWorld(ALWAYS_GREEN, { obstacles: false })
    for (let i = 0; i < 4; i++) {
      stepWorld(w, DT, 'left')
      stepWorld(w, DT, 'none')
    }
    expect(w.laneIndex).toBe(0)
    for (let i = 0; i < 4; i++) {
      stepWorld(w, DT, 'right')
      stepWorld(w, DT, 'none')
    }
    expect(w.laneIndex).toBe(LANES.length - 1)
  })

  it('switching straight from left to right counts as a new lean', () => {
    const w = createWorld(ALWAYS_GREEN, { obstacles: false })
    stepWorld(w, DT, 'left')
    stepWorld(w, DT, 'right')
    expect(w.laneIndex).toBe(START_LANE)
  })

  it("'left' is the smaller x and x glides to the lane centre", () => {
    const w = createWorld(ALWAYS_GREEN, { obstacles: false })
    stepWorld(w, DT, 'left')
    expect(w.x).toBeLessThan(LANES[START_LANE])
    expect(w.x).toBeGreaterThan(LANES[START_LANE - 1])
    run(w, { action: 'none', maxSeconds: 1.5 })
    expect(w.x).toBeCloseTo(LANES[START_LANE - 1], 2)
  })
})

describe('speed', () => {
  it('accelerates to cruise and brakes to exactly 0 while stop is held', () => {
    const w = createWorld(ALWAYS_GREEN, { obstacles: false })
    run(w, { maxSeconds: 5 })
    expect(w.speed).toBeCloseTo(CRUISE_SPEED, 5)
    const startS = w.distance
    run(w, { action: 'stop', until: (x) => x.speed === 0, maxSeconds: 5 })
    expect(w.speed).toBe(0)
    expect(w.braking).toBe(true)
    const brakingDistance = w.distance - startS
    expect(brakingDistance).toBeCloseTo((CRUISE_SPEED * CRUISE_SPEED) / (2 * BRAKE_DECEL), 0)
    run(w, { action: 'stop', maxSeconds: 1 })
    expect(w.speed).toBe(0)
  })
})

describe('traffic lights', () => {
  it('jumping a red emits RED_LIGHT exactly once', () => {
    const w = createWorld(ALWAYS_RED, { obstacles: false })
    const firstLine = SIM.FIRST_LIGHT_AT
    const events = run(w, { until: (x) => front(x) > firstLine + 60 })
    expect(count(events, EVENT.RED_LIGHT)).toBe(1)
    expect(count(events, EVENT.CLEAN_STOP)).toBe(0)
  })

  it('stopping at a red emits CLEAN_STOP once, then the light turns green', () => {
    const w = createWorld(ALWAYS_RED, { obstacles: false })
    const light = () => w.lights.find((l) => l.s === SIM.FIRST_LIGHT_AT)
    const events = run(w, { until: () => light().state === 'red' })
    expect(events).toEqual([])
    // Brake when the nose is ~17 m out (braking takes ~11.6 m at cruise).
    events.push(...run(w, { until: (x) => light().s - front(x) <= 17 }))
    const stopEvents = run(w, { action: 'stop', maxSeconds: LIGHT_GREEN_AFTER_STOP - 0.5 })
    expect(count(stopEvents, EVENT.CLEAN_STOP)).toBe(1)
    expect(front(w)).toBeLessThan(light().s)
    expect(light().state).toBe('red') // still waiting
    stopEvents.push(...run(w, { action: 'stop', maxSeconds: 2 }))
    expect(light().state).toBe('green')
    stopEvents.push(...run(w, { until: (x) => front(x) > SIM.FIRST_LIGHT_AT + 20 }))
    expect(count(stopEvents, EVENT.CLEAN_STOP)).toBe(1)
    expect(count([...events, ...stopEvents], EVENT.RED_LIGHT)).toBe(0)
  })

  it('green lights produce no events', () => {
    const w = createWorld(ALWAYS_GREEN, { obstacles: false })
    const events = run(w, { maxSeconds: 75 })
    expect(w.distance).toBeGreaterThan(SIM.FIRST_LIGHT_AT + 4 * 190)
    expect(events).toEqual([])
  })

  it('a red is always stoppable at cruise, with time to react', () => {
    // Maths: red shows at >= LIGHT_RED_AT (minus one frame of travel at the
    // max clamped dt of 0.05 s); braking from cruise needs v²/2a.
    const brakingDistance = (CRUISE_SPEED * CRUISE_SPEED) / (2 * BRAKE_DECEL)
    const worstGap = LIGHT_RED_AT - CRUISE_SPEED * 0.05
    const reactionSeconds = (worstGap - brakingDistance) / CRUISE_SPEED
    expect(reactionSeconds).toBeGreaterThan(1.5)

    // Simulation: react 1.5 s after the red appears, then hold the brake.
    const w = createWorld(ALWAYS_RED, { obstacles: false })
    const light = () => w.lights.find((l) => l.s === SIM.FIRST_LIGHT_AT)
    run(w, { until: () => light().state === 'red' })
    expect(light().s - front(w)).toBeGreaterThanOrEqual(LIGHT_RED_AT - CRUISE_SPEED * DT)
    const events = run(w, { maxSeconds: 1.5 })
    events.push(...run(w, { action: 'stop', maxSeconds: 3 }))
    expect(count(events, EVENT.RED_LIGHT)).toBe(0)
    expect(count(events, EVENT.CLEAN_STOP)).toBe(1)
  })

  it('a red never appears closer than LIGHT_RED_AT even when the car slows on yellow', () => {
    const w = createWorld(ALWAYS_RED, { obstacles: false })
    const light = () => w.lights.find((l) => l.s === SIM.FIRST_LIGHT_AT)
    run(w, { until: () => light().state === 'yellow' })
    // Crawl: brake a bit, coast a bit.
    run(w, {
      action: (x) => (x.speed > 4 ? 'stop' : 'none'),
      until: () => light().state === 'red',
    })
    expect(light().state).toBe('red')
    expect(light().s - front(w)).toBeGreaterThanOrEqual(LIGHT_RED_AT)
  })
})

describe('obstacles', () => {
  it('spawn in the current lane and dodging one emits CLEAN_LANE_CHANGE', () => {
    const w = createWorld(ALWAYS_GREEN)
    run(w, { until: (x) => x.obstacles.length > 0 })
    const ob = w.obstacles[0]
    expect(ob.lane).toBe(w.laneIndex)
    stepWorld(w, DT, 'left')
    const events = run(w, { until: (_x, ev) => ev.length > 0 })
    expect(events).toEqual([EVENT.CLEAN_LANE_CHANGE])
    expect(ob.passed).toBe(true)
  })

  it('staying in the lane emits COLLISION once and cuts speed', () => {
    const w = createWorld(ALWAYS_GREEN)
    run(w, { until: (x) => x.obstacles.length > 0 })
    const id = w.obstacles[0].id
    let speedBefore = 0
    const events = run(w, {
      until: (x, ev) => {
        if (ev.length === 0) speedBefore = x.speed
        return ev.length > 0
      },
    })
    expect(events).toEqual([EVENT.COLLISION])
    expect(w.speed).toBeCloseTo(speedBefore * SIM.COLLISION_SPEED_FACTOR, 1)
    expect(w.obstacles.some((o) => o.id === id)).toBe(false)
    const after = run(w, { maxSeconds: 1 })
    expect(count(after, EVENT.COLLISION)).toBe(0)
    expect(count(after, EVENT.CLEAN_LANE_CHANGE)).toBe(0)
  })

  it('never spawn (or get caught up with) near a stop line', () => {
    let seed = 42
    const lcg = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const w = createWorld(lcg)
    const seen = new Set()
    let spawned = 0
    run(w, {
      action: (x) => (Math.floor(x.timeElapsed / 4) % 2 ? 'left' : 'right'),
      maxSeconds: 75,
      until: (x) => {
        for (const o of x.obstacles) {
          if (seen.has(o.id)) continue
          seen.add(o.id)
          spawned++
          expect(gapToNearestStopLine(o.s)).toBeGreaterThanOrEqual(OBSTACLE_MIN_GAP)
        }
        return false
      },
    })
    expect(spawned).toBeGreaterThan(3)
  })

  it('stop and queue behind a red stop line', () => {
    const w = createWorld(ALWAYS_RED, { obstacles: false })
    const line = 60
    w.lights.push({ id: 900, s: line, state: 'red', decided: true, yellowAt: 0, greenAt: null, stopped: false, violated: false })
    w.obstacles.push(
      { id: 901, s: 40, lane: 0, x: LANES[0], speed: 6, passed: false },
      { id: 902, s: 30, lane: 0, x: LANES[0], speed: 6, passed: false },
    )
    run(w, { action: 'stop', maxSeconds: 10 })
    const [lead, follower] = [...w.obstacles].sort((a, b) => b.s - a.s)
    expect(lead.s + HALF).toBeLessThanOrEqual(line + 1e-9)
    expect(lead.s + HALF).toBeGreaterThan(line - 0.5)
    expect(lead.speed).toBeLessThan(0.5)
    expect(follower.s + HALF).toBeLessThanOrEqual(lead.s - HALF)
    // Light goes green: they drive on through.
    w.lights.find((l) => l.id === 900).state = 'green'
    run(w, { action: 'stop', maxSeconds: 3 })
    expect(Math.min(lead.s, follower.s) - HALF).toBeGreaterThan(line)
  })
})

describe('idle backdrop options', () => {
  it('obstacles: false + redLights: false never produces an event', () => {
    const w = createWorld(ALWAYS_RED, { obstacles: false, redLights: false, cruiseSpeed: CRUISE_SPEED * 0.45 })
    const events = run(w, { maxSeconds: 120 })
    expect(events).toEqual([])
    expect(w.obstacles).toEqual([])
    expect(w.speed).toBeCloseTo(CRUISE_SPEED * 0.45, 5)
  })
})

describe('resetWorld', () => {
  it('returns the world to its starting state', () => {
    const w = createWorld(ALWAYS_RED)
    run(w, { maxSeconds: 20 })
    resetWorld(w)
    expect(w.distance).toBe(0)
    expect(w.timeElapsed).toBe(0)
    expect(w.laneIndex).toBe(START_LANE)
    expect(w.lights).toEqual([])
    expect(w.obstacles).toEqual([])
  })
})
