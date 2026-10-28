/**
 * Pure driving simulation: moves the car, runs the traffic lights and the slow
 * cars, and reports which scoring events happened this step.
 *
 * ── IN SIMPLE WORDS ──
 * This is the referee and the road itself, without any pictures. Every frame
 * the 3D scene asks it "the player is leaning left / braking / doing nothing,
 * and this much time passed; what happened?". It moves the car forward, swaps
 * lanes, turns lights yellow and red, drives the slow cars, and answers with a
 * list like ['CLEAN_STOP'] or ['COLLISION']. It never draws anything and never
 * touches React, so it can be tested on its own like a calculator.
 *
 * Direction convention: the road is measured by `s`, metres travelled forward
 * from the start (world.distance is the player's `s`). The 3D scene draws a
 * point at s as three.js z = -s, so "forward" is -z. Lane x comes straight
 * from LANES (-3, 0, 3); 'left' moves to the smaller x, which is screen-left
 * for a camera behind the car looking down -z.
 *
 * ── BUSINESS RULES ──
 * - Red Light Violations (hackathon brief §2 Gameplay Rules): crossing the
 *   stop line while the light is red emits RED_LIGHT, once per light. Yellow
 *   is allowed. Stopping before the line on red emits CLEAN_STOP once, then
 *   the light turns green after LIGHT_GREEN_AFTER_STOP seconds.
 * - Lane Discipline (hackathon brief §2 Gameplay Rules): a slow car is spawned
 *   in the player's current lane. Passing it without touching it emits
 *   CLEAN_LANE_CHANGE once; hitting it emits COLLISION once, removes it and
 *   cuts the player's speed to COLLISION_SPEED_FACTOR of what it was.
 * - One lean = one lane (edge-triggered), clamped to the 3 lanes.
 * - All tuning numbers come from rules.js; the extra geometry constants below
 *   (car size, stop zone, ...) are exported as SIM so the scene draws the same
 *   sizes the referee uses.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - Edge-triggered lane changes: a held lean must not keep sliding the car.
 *   Without it one lean of ~0.3 s at 60 fps would jump straight to the edge
 *   lane, and the player could never pick the middle lane.
 * - A light turns red when the car is LIGHT_RED_AT m away OR when yellow has
 *   lasted as long as it would take at cruise, whichever comes first. So a red
 *   never appears closer than LIGHT_RED_AT, and at cruise the braking distance
 *   v²/(2·BRAKE_DECEL) ≈ 11.6 m leaves ≈ 2.3 s of reaction time (tested).
 *   Without the distance trigger a slow player would get a red right at the
 *   line; without the time trigger a stopped player would see yellow forever.
 * - CLEAN_STOP counts anywhere in the last STOP_ZONE m before the line, not
 *   just the last 3 m. Braking from cruise takes ≈ 11.6 m, so a 3 m window is
 *   ~0.2 s of timing with a webcam gesture: almost nobody could earn it.
 * - Obstacles never spawn within OBSTACLE_MIN_GAP of a stop line, and neither
 *   does the point where the player would catch them at cruise. Without the
 *   second check the player meets a slow car exactly at the line while the
 *   light goes red, and must choose between two penalties.
 * - Obstacles brake for any non-green light ahead and queue behind each
 *   other, so they never visibly run a red or drive through each other.
 * - Events are flags on the light/obstacle (violated, stopped, hit, passed),
 *   not frame-by-frame checks, so each one fires exactly once even though the
 *   condition stays true for many frames.
 * - rng is injected so tests are deterministic (0 => every light red, 0.99 =>
 *   every light green).
 *
 * ── DO NOT ──
 * - Do not import three.js or React here; the tests run in plain Node.
 * - Do not hard-code numbers that exist in rules.js; import them.
 * - Do not call rng() per frame for cosmetic things: every extra call shifts
 *   the sequence the tests rely on.
 * - Do not flip the sign convention in only one place: the scene's z = -s and
 *   the 'left' = smaller x rule must change together.
 */
import {
  ACCEL,
  BRAKE_DECEL,
  CRUISE_SPEED,
  EVENT,
  LANES,
  LIGHT_GREEN_AFTER_STOP,
  LIGHT_RED_AT,
  LIGHT_RED_CHANCE,
  LIGHT_SPACING,
  LIGHT_YELLOW_AT,
  OBSTACLE_MIN_GAP,
  OBSTACLE_SPAWN_AHEAD,
  START_LANE,
} from './rules.js'

/** Geometry and feel constants not covered by rules.js (shared with the scene). */
export const SIM = {
  CAR_LENGTH: 4, // metres, player and obstacle cars
  CAR_WIDTH: 1.8,
  FIRST_LIGHT_AT: 150, // s of the first stop line
  STOP_ZONE: 15, // a stop counts if the car's nose is within this many metres before the line
  STOP_SPEED: 0.3, // m/s, "stopped"
  LANE_SMOOTH: 9, // 1/s, how fast x glides to the lane centre
  OBSTACLE_SPEED_RATIO: 0.4, // slow cars drive at 40% of cruise
  OBSTACLE_DECEL: 8, // m/s², slow cars braking for a light
  QUEUE_GAP: 1.5, // metres kept between queued cars
  SPAWN_EVERY_MIN: 90, // metres of travel between spawns ...
  SPAWN_EVERY_RANGE: 40, // ... plus up to this much at random
  FIRST_SPAWN_AT: 30,
  COLLIDE_X: 1.4, // |dx| below this counts as the same lane
  COLLISION_SPEED_FACTOR: 0.4,
  LIGHT_LOOKAHEAD: 420, // lights are generated this far ahead
  PRUNE_BEHIND: 40, // lights / obstacles this far behind are removed
  YELLOW_TIME: (LIGHT_YELLOW_AT - LIGHT_RED_AT) / CRUISE_SPEED, // ≈ 1.5 s at cruise
}

const HALF = SIM.CAR_LENGTH / 2
const OBSTACLE_SPEED = CRUISE_SPEED * SIM.OBSTACLE_SPEED_RATIO
// Where the player catches a slow car spawned OBSTACLE_SPAWN_AHEAD in front, at cruise.
const CATCH_UP_AHEAD = (OBSTACLE_SPAWN_AHEAD * CRUISE_SPEED) / (CRUISE_SPEED - OBSTACLE_SPEED)

/** Stop-line position of light number k (0-based). */
export const stopLineAt = (k) => SIM.FIRST_LIGHT_AT + k * LIGHT_SPACING

/** Distance from s to the nearest stop line (lines are at fixed positions). */
export function gapToNearestStopLine(s) {
  const k = Math.max(0, Math.round((s - SIM.FIRST_LIGHT_AT) / LIGHT_SPACING))
  const a = Math.abs(s - stopLineAt(k))
  const b = k > 0 ? Math.abs(s - stopLineAt(k - 1)) : Infinity
  return Math.min(a, b, Math.abs(s - stopLineAt(k + 1)))
}

/**
 * opts:
 *  - obstacles (default true): spawn slow cars
 *  - redLights (default true): lights may turn red (false = always green)
 *  - cruiseSpeed (default CRUISE_SPEED): the idle backdrop uses a slower cruise
 */
export function createWorld(rng = Math.random, opts = {}) {
  const world = {
    rng,
    opts: { obstacles: true, redLights: true, cruiseSpeed: CRUISE_SPEED, ...opts },
  }
  return resetWorld(world)
}

export function resetWorld(world) {
  world.distance = 0 // s of the player's centre
  world.speed = 0 // m/s
  world.laneIndex = START_LANE
  world.x = LANES[START_LANE] // smoothed, for animation and collision
  world.timeElapsed = 0
  world.braking = false
  world.lastAction = 'none'
  world.lights = [] // { id, s, state: 'green'|'yellow'|'red', decided, yellowAt, greenAt, stopped, violated }
  world.obstacles = [] // { id, s, lane, x, speed, passed }
  world.nextLightIndex = 0
  world.nextSpawnAt = SIM.FIRST_SPAWN_AT
  world.nextId = 1
  return world
}

function updateLane(world, action, dt) {
  if (action !== world.lastAction) {
    if (action === 'left') world.laneIndex = Math.max(0, world.laneIndex - 1)
    if (action === 'right') world.laneIndex = Math.min(LANES.length - 1, world.laneIndex + 1)
  }
  world.lastAction = action
  const target = LANES[world.laneIndex]
  world.x += (target - world.x) * (1 - Math.exp(-SIM.LANE_SMOOTH * dt))
}

function updateSpeed(world, action, dt) {
  world.braking = action === 'stop'
  const cruise = world.opts.cruiseSpeed
  if (world.braking) {
    world.speed = Math.max(0, world.speed - BRAKE_DECEL * dt)
  } else if (world.speed < cruise) {
    world.speed = Math.min(cruise, world.speed + ACCEL * dt)
  } else {
    world.speed = Math.max(cruise, world.speed - BRAKE_DECEL * dt)
  }
}

function updateLights(world, prevFront, events) {
  const front = world.distance + HALF
  const t = world.timeElapsed

  while (stopLineAt(world.nextLightIndex) < world.distance + SIM.LIGHT_LOOKAHEAD) {
    world.lights.push({
      id: world.nextId++,
      s: stopLineAt(world.nextLightIndex),
      state: 'green',
      decided: false,
      yellowAt: 0,
      greenAt: null,
      stopped: false,
      violated: false,
    })
    world.nextLightIndex++
  }

  for (const light of world.lights) {
    const gap = light.s - front

    if (!light.decided && gap <= LIGHT_YELLOW_AT && gap > 0) {
      light.decided = true
      if (world.opts.redLights && world.rng() < LIGHT_RED_CHANCE) {
        light.state = 'yellow'
        light.yellowAt = t
      }
    }

    if (light.state === 'yellow' && (gap <= LIGHT_RED_AT || t - light.yellowAt >= SIM.YELLOW_TIME)) {
      light.state = 'red'
    }

    if (light.state === 'red' && !light.violated && prevFront <= light.s && front > light.s) {
      light.violated = true
      events.push(EVENT.RED_LIGHT)
    }

    if (
      light.state === 'red' &&
      !light.stopped &&
      gap >= 0 &&
      gap <= SIM.STOP_ZONE &&
      world.speed < SIM.STOP_SPEED
    ) {
      light.stopped = true
      light.greenAt = t + LIGHT_GREEN_AFTER_STOP
      events.push(EVENT.CLEAN_STOP)
    }

    if (light.greenAt !== null && t >= light.greenAt) light.state = 'green'
  }

  world.lights = world.lights.filter((l) => l.s > world.distance - SIM.PRUNE_BEHIND)
}

function updateObstacles(world, dt, events) {
  // Leaders first, so followers queue behind their updated position.
  world.obstacles.sort((a, b) => b.s - a.s)

  for (let i = 0; i < world.obstacles.length; i++) {
    const ob = world.obstacles[i]
    const front = ob.s + HALF

    // The nearest thing the slow car must not pass: a non-green stop line, or the car ahead.
    let limit = Infinity
    for (const light of world.lights) {
      if (light.state !== 'green' && light.s >= front - 0.01 && light.s < limit) limit = light.s
    }
    for (let j = 0; j < i; j++) {
      const lead = world.obstacles[j]
      if (lead.lane === ob.lane) {
        limit = Math.min(limit, lead.s - HALF - SIM.QUEUE_GAP)
        break
      }
    }

    let v = Math.min(OBSTACLE_SPEED, ob.speed + ACCEL * dt)
    if (limit !== Infinity) v = Math.min(v, Math.sqrt(2 * SIM.OBSTACLE_DECEL * Math.max(0, limit - front)))
    ob.speed = v
    ob.s += v * dt
    if (limit !== Infinity && front <= limit) ob.s = Math.min(ob.s, limit - HALF)
  }

  const survivors = []
  for (const ob of world.obstacles) {
    const overlapX = Math.abs(world.x - ob.x) < SIM.COLLIDE_X
    const overlapZ = Math.abs(world.distance - ob.s) < SIM.CAR_LENGTH
    if (overlapX && overlapZ) {
      events.push(EVENT.COLLISION)
      world.speed *= SIM.COLLISION_SPEED_FACTOR
      continue // removed
    }
    if (!ob.passed && world.distance - ob.s > SIM.CAR_LENGTH) {
      ob.passed = true
      events.push(EVENT.CLEAN_LANE_CHANGE)
    }
    if (ob.s > world.distance - SIM.PRUNE_BEHIND) survivors.push(ob)
  }
  world.obstacles = survivors
}

function maybeSpawn(world) {
  if (!world.opts.obstacles || world.distance < world.nextSpawnAt) return
  const s = world.distance + OBSTACLE_SPAWN_AHEAD
  const catchUp = world.distance + CATCH_UP_AHEAD
  const lane = world.laneIndex
  const fair =
    gapToNearestStopLine(s) >= OBSTACLE_MIN_GAP &&
    gapToNearestStopLine(catchUp) >= OBSTACLE_MIN_GAP &&
    !world.obstacles.some((o) => o.lane === lane && Math.abs(o.s - s) < SIM.CAR_LENGTH * 3)
  if (!fair) return // try again next step, a few metres further on

  world.obstacles.push({ id: world.nextId++, s, lane, x: LANES[lane], speed: OBSTACLE_SPEED, passed: false })
  world.nextSpawnAt = world.distance + SIM.SPAWN_EVERY_MIN + world.rng() * SIM.SPAWN_EVERY_RANGE
}

/**
 * Advance the world by dt seconds with the current action
 * ('left' | 'right' | 'stop' | 'none'). Returns the EVENT types that happened.
 */
export function stepWorld(world, dt, action = 'none') {
  const events = []
  if (!(dt > 0)) return events

  world.timeElapsed += dt
  updateLane(world, action, dt)
  updateSpeed(world, action, dt)

  const prevFront = world.distance + HALF
  world.distance += world.speed * dt

  updateLights(world, prevFront, events)
  updateObstacles(world, dt, events)
  maybeSpawn(world)
  return events
}
