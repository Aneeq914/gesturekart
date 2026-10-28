/**
 * The 3D game world: owns the simulation, steps it every frame while a round
 * is playing, reports events to the store, and draws the road at dusk.
 *
 * ── IN SIMPLE WORDS ──
 * This is the TV that shows the game and the engine that runs it. Each frame
 * it reads what the player is doing (lean left/right, hand up), lets
 * simulation.js move the car, sends anything that happened (a clean stop, a
 * crash) to the scoreboard, and moves the 3D models to match. Before and after
 * a round it shows a calm drive-through as a background for the menus.
 *
 * ── BUSINESS RULES ──
 * - A round lasts GAME_DURATION seconds of simulated time, then endGame()
 *   (rules.js, hackathon brief §2).
 * - Scoring events only come from the playing world; the idle backdrop has no
 *   obstacles and no red lights, so it can never produce one.
 * - A new roundId (startGame) always starts a fresh world, so a new round
 *   never inherits the old car position, lights or obstacles.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - The world lives in a ref and meshes are moved in useFrame. If the world
 *   were React state, the whole scene would re-render 60 times a second.
 * - Input is read with useGameStore.getState() inside the frame loop, not a
 *   hook. A hook would re-render the scene on every gesture change.
 * - The simulation runs at useFrame priority -1 so every visual component
 *   (priority 0) draws this frame's world, not last frame's. A positive
 *   priority would switch off R3F's automatic rendering (black screen).
 * - Each frame is simulated in sub-steps of at most MAX_DT. With one big step,
 *   a slow device (low fps) would let the car skip over a stop line or an
 *   obstacle; with a plain clamp instead, the 75 s clock would run in slow
 *   motion on that device (seen at ~3 fps in headless Chrome: 11 game-seconds
 *   per ~85 real seconds). The frame delta itself is capped at MAX_FRAME so a
 *   tab switch (a huge delta) can't fast-forward the round.
 * - HUD updates (speed, time) are throttled to HUD_INTERVAL; without it the
 *   HUD re-renders every frame.
 * - In portrait the camera pulls back and widens its FOV so all 3 lanes stay
 *   on screen; with a fixed vertical FOV a phone only shows the middle lane.
 *
 * ── DO NOT ──
 * - Do not call addEvent from the idle world (phase 'start' / 'over').
 * - Do not create geometries or materials inside useFrame.
 * - Do not subscribe this component to `input`, `speed` or `timeLeft`.
 */
import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore.js'
import { CRUISE_SPEED, GAME_DURATION, kmh } from './rules.js'
import { createWorld, stepWorld } from './simulation.js'
import Sky, { SKY } from './Sky.jsx'
import Road from './Road.jsx'
import Scenery from './Scenery.jsx'
import TrafficLights from './TrafficLights.jsx'
import PlayerCar from './PlayerCar.jsx'
import Obstacles from './Obstacles.jsx'

const MAX_DT = 0.05 // largest single simulation step (seconds)
const MAX_FRAME = 0.25 // largest frame delta we honour; more is a tab switch
const HUD_INTERVAL = 0.2 // seconds between HUD pushes (5 per second)
const IDLE_OPTS = { obstacles: false, redLights: false, cruiseSpeed: CRUISE_SPEED * 0.45 }
const FOG_NEAR = 45
const FOG_FAR = 230

const makeIdleWorld = () => {
  const w = createWorld(Math.random, IDLE_OPTS)
  w.speed = IDLE_OPTS.cruiseSpeed
  w.mode = 'idle'
  return w
}

function Simulation({ worldRef }) {
  const hudTimer = useRef(0)

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MAX_FRAME)
    const steps = Math.ceil(dt / MAX_DT) || 1
    const subDt = dt / steps
    const store = useGameStore.getState()
    let world = worldRef.current

    // Swap worlds on phase / round changes (done here so no frame ever
    // steps the wrong world).
    if (store.phase === 'playing' && (world.mode !== 'play' || world.roundId !== store.roundId)) {
      world = createWorld(Math.random)
      world.mode = 'play'
      world.roundId = store.roundId
      worldRef.current = world
      hudTimer.current = HUD_INTERVAL
    } else if (store.phase === 'start' && world.mode !== 'idle') {
      world = makeIdleWorld()
      worldRef.current = world
    }

    if (store.phase === 'over') return // frozen; the camera drifts
    if (world.mode === 'idle') {
      for (let i = 0; i < steps; i++) stepWorld(world, subDt, 'none')
      return
    }

    const action = store.input.action
    for (let i = 0; i < steps && world.timeElapsed < GAME_DURATION; i++) {
      for (const type of stepWorld(world, subDt, action)) store.addEvent(type)
    }

    const finished = world.timeElapsed >= GAME_DURATION
    hudTimer.current += dt
    if (hudTimer.current >= HUD_INTERVAL || finished) {
      hudTimer.current = 0
      store.setSpeed(kmh(world.speed))
      store.setTimeLeft(GAME_DURATION - world.timeElapsed)
    }
    if (finished) store.endGame()
  }, -1)

  return null
}

const lerp = (a, b, t) => a + (b - a) * t

function ChaseCamera({ worldRef }) {
  const size = useThree((s) => s.size)
  const look = useRef(new THREE.Vector3())
  const camX = useRef(0)

  useFrame(({ camera, clock }, delta) => {
    const world = worldRef.current
    const dt = Math.min(delta, MAX_DT)
    const aspect = size.width / Math.max(1, size.height)
    const portrait = THREE.MathUtils.clamp((1.2 - aspect) / 0.75, 0, 1) // 0 wide → 1 tall phone

    const back = lerp(9.5, 14, portrait)
    const height = lerp(4.5, 7, portrait)
    // Keep ~±5.2 m (all 3 lanes + a bit of kerb) visible at the car.
    const neededFov = THREE.MathUtils.radToDeg(2 * Math.atan(5.2 / (back * aspect)))
    const fov = THREE.MathUtils.clamp(neededFov, 55, 84)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    const t = clock.elapsedTime
    const phase = useGameStore.getState().phase
    let swayX = 0
    let lift = 0
    if (phase === 'start') {
      swayX = Math.sin(t * 0.25) * 1.6
      lift = 0.8 + Math.sin(t * 0.17) * 0.4
    } else if (phase === 'over') {
      swayX = Math.sin(t * 0.2) * 3
      lift = 1.5 + Math.sin(t * 0.13) * 0.5
    }

    camX.current += (world.x * 0.55 + swayX - camX.current) * (1 - Math.exp(-4 * dt))
    const carZ = -world.distance
    camera.position.set(camX.current, height + lift, carZ + back)
    look.current.set(world.x * 0.3, 1, carZ - 18)
    camera.lookAt(look.current)
  })

  return null
}

function World() {
  const worldRef = useRef(null)
  if (!worldRef.current) worldRef.current = makeIdleWorld()

  return (
    <>
      <fog attach="fog" args={[SKY.horizon, FOG_NEAR, FOG_FAR]} />
      <hemisphereLight args={['#8fa0ff', '#1a1430', 1.15]} />
      <directionalLight position={[-6, 10, 4]} intensity={1.3} color="#ffd9a8" />
      <directionalLight position={[8, 6, -10]} intensity={0.35} color="#6ea8ff" />

      <Simulation worldRef={worldRef} />
      <ChaseCamera worldRef={worldRef} />

      <Sky />
      <Road worldRef={worldRef} />
      <Scenery worldRef={worldRef} />
      <TrafficLights worldRef={worldRef} />
      <Obstacles worldRef={worldRef} />
      <PlayerCar worldRef={worldRef} />
    </>
  )
}

export default function GameScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: 55, near: 0.1, far: 1000, position: [0, 4.5, 10] }}
      style={{ width: '100%', height: '100%', background: SKY.top }}
    >
      <World />
    </Canvas>
  )
}
