/**
 * The slow obstacle cars, drawn from a fixed pool of car models.
 * Pooling: the simulation adds and removes obstacles constantly; mounting a
 * new React car per obstacle would allocate geometry/materials and re-render
 * mid-game, so a fixed set of slots is mapped to obstacles by id each frame
 * and unused slots are simply hidden.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CarModel } from './CarModel.jsx'

const POOL = 6
const HEX = ['#5a7fc4', '#d9deea', '#2bb3a3', '#8c7bd6', '#c9867a']
const COLORS = HEX.map((h) => new THREE.Color(h))
const SLOTS = Array.from({ length: POOL }, (_, i) => i)

export default function Obstacles({ worldRef }) {
  const groups = useRef([])
  const tails = useRef(SLOTS.map(() => ({ current: null })))
  const bodies = useRef(SLOTS.map(() => ({ current: null })))
  const slotIds = useRef(new Array(POOL).fill(null))
  const prevSpeed = useRef(new Array(POOL).fill(0))

  useFrame((_, delta) => {
    const w = worldRef.current
    if (!w) return
    const ids = slotIds.current
    const obs = w.obstacles
    const k = 1 - Math.exp(-14 * Math.min(delta, 0.05))

    // Free slots whose obstacle is gone.
    for (let i = 0; i < POOL; i++) {
      if (ids[i] === null) continue
      let alive = false
      for (let j = 0; j < obs.length; j++) if (obs[j].id === ids[i]) alive = true
      if (!alive) ids[i] = null
    }

    // Give each new obstacle a free slot (stable colour per id).
    for (let j = 0; j < obs.length; j++) {
      const id = obs[j].id
      if (ids.includes(id)) continue
      const free = ids.indexOf(null)
      if (free === -1) break
      ids[free] = id
      prevSpeed.current[free] = obs[j].speed
      const body = bodies.current[free].current
      if (body) body.color.copy(COLORS[id % COLORS.length])
    }

    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i]
      if (!g) continue
      let ob = null
      if (ids[i] !== null) for (let j = 0; j < obs.length; j++) if (obs[j].id === ids[i]) ob = obs[j]
      if (!ob) {
        g.visible = false
        continue
      }
      g.visible = true
      g.position.set(ob.x, 0, -ob.s)
      const braking = ob.speed < prevSpeed.current[i] - 1e-4 || ob.speed < 3
      prevSpeed.current[i] = ob.speed
      const tail = tails.current[i].current
      if (tail) tail.emissiveIntensity += ((braking ? 3 : 0.6) - tail.emissiveIntensity) * k
    }
  })

  return (
    <>
      {SLOTS.map((i) => (
        <CarModel
          key={i}
          color={HEX[i % HEX.length]}
          visible={false}
          groupRef={(el) => {
            groups.current[i] = el
          }}
          tailRef={tails.current[i]}
          bodyRef={bodies.current[i]}
        />
      ))}
    </>
  )
}
