/**
 * Traffic light assemblies (overhead pole, small kerbside repeater, stop line
 * and zebra crossing), drawn from a fixed pool of 4 slots.
 * Pooling: lights are generated and pruned by the simulation as the car
 * advances; a fixed set of slots mapped by id avoids mounting new meshes
 * and materials mid-game. Each slot owns its own 3 lamp materials so
 * neighbouring lights can show different states.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const POOL = 4
const SLOTS = Array.from({ length: POOL }, (_, i) => i)
const LAMP_HEX = ['#ff4d5e', '#ffc531', '#2ee6a0'] // top -> bottom
const LAMP_COLORS = LAMP_HEX.map((h) => new THREE.Color(h))
const STATE_INDEX = { red: 0, yellow: 1, green: 2 }
const ON = 1.4
const OFF = 0.05

// Geometry (module level: shared by every slot)
const poleGeo = new THREE.CylinderGeometry(0.12, 0.14, 6, 10)
const shortPoleGeo = new THREE.CylinderGeometry(0.09, 0.1, 3.2, 8)
const baseGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5)
const armGeo = new THREE.BoxGeometry(5, 0.18, 0.18)
const housingGeo = new THREE.BoxGeometry(0.6, 1.6, 0.5)
const smallHousingGeo = new THREE.BoxGeometry(0.42, 1.15, 0.36)
const lampGeo = new THREE.SphereGeometry(0.19, 16, 12)
const smallLampGeo = new THREE.SphereGeometry(0.13, 12, 10)
const visorGeo = new THREE.BoxGeometry(0.46, 0.04, 0.26)
const haloGeo = new THREE.CircleGeometry(0.55, 24)
const stopLineGeo = new THREE.BoxGeometry(9, 0.03, 0.5)
const zebraGeo = mergeGeometries(
  Array.from({ length: 9 }, (_, i) => new THREE.BoxGeometry(0.5, 0.03, 4).translate(-4 + i, 0, 0)),
)

const poleMat = new THREE.MeshStandardMaterial({ color: '#2a3150', metalness: 0.6, roughness: 0.45 })
const housingMat = new THREE.MeshStandardMaterial({ color: '#0f1428', metalness: 0.3, roughness: 0.6 })
const paintMat = new THREE.MeshStandardMaterial({
  color: '#e8ecf6',
  emissive: '#e8ecf6',
  emissiveIntensity: 0.12,
  roughness: 0.8,
})

const LAMP_Y = [0.5, 0, -0.5]
const HOUSING = [1.8, 4.92, 0] // hangs from the arm over the right half of the road
const SMALL = [-6.5, 3.6, 0] // kerbside repeater on the left sidewalk

function makeSlot() {
  const lamps = LAMP_HEX.map(
    (hex) =>
      new THREE.MeshStandardMaterial({
        color: '#1a1b24',
        emissive: hex,
        emissiveIntensity: OFF,
        roughness: 0.3,
        toneMapped: false, // keep the true red/amber/green instead of tone-mapping to white
      }),
  )
  const halo = new THREE.MeshBasicMaterial({
    color: LAMP_COLORS[2].clone(),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return { lamps, halo }
}

export default function TrafficLights({ worldRef }) {
  const slots = useMemo(() => SLOTS.map(makeSlot), [])
  const groups = useRef([])
  const halos = useRef([])
  const smallHalos = useRef([])
  const slotIds = useRef(new Array(POOL).fill(null))

  useEffect(
    () => () => {
      for (const s of slots) {
        s.lamps.forEach((m) => m.dispose())
        s.halo.dispose()
      }
    },
    [slots],
  )

  useFrame(() => {
    const w = worldRef.current
    if (!w) return
    const ids = slotIds.current
    const lights = w.lights

    for (let i = 0; i < POOL; i++) {
      if (ids[i] === null) continue
      let alive = false
      for (let j = 0; j < lights.length; j++) if (lights[j].id === ids[i]) alive = true
      if (!alive) ids[i] = null
    }
    for (let j = 0; j < lights.length; j++) {
      if (ids.includes(lights[j].id)) continue
      const free = ids.indexOf(null)
      if (free === -1) break
      ids[free] = lights[j].id
    }

    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i]
      if (!g) continue
      let light = null
      if (ids[i] !== null) for (let j = 0; j < lights.length; j++) if (lights[j].id === ids[i]) light = lights[j]
      if (!light) {
        g.visible = false
        continue
      }
      g.visible = true
      g.position.z = -light.s

      const active = STATE_INDEX[light.state] ?? 2
      const slot = slots[i]
      for (let l = 0; l < 3; l++) slot.lamps[l].emissiveIntensity = l === active ? ON : OFF
      slot.halo.color.copy(LAMP_COLORS[active])
      const y = LAMP_Y[active]
      const h = halos.current[i]
      if (h) h.position.y = HOUSING[1] + y
      const sh = smallHalos.current[i]
      if (sh) sh.position.y = SMALL[1] + y * 0.72
    }
  })

  return (
    <>
      {SLOTS.map((i) => {
        const slot = slots[i]
        return (
          <group
            key={i}
            visible={false}
            ref={(el) => {
              groups.current[i] = el
            }}
          >
            {/* Overhead pole on the right sidewalk */}
            <mesh geometry={baseGeo} material={poleMat} position={[6.5, 0.15, 0]} />
            <mesh geometry={poleGeo} material={poleMat} position={[6.5, 3, 0]} />
            <mesh geometry={armGeo} material={poleMat} position={[4, 5.8, 0]} />
            <mesh geometry={housingGeo} material={housingMat} position={HOUSING} />
            {LAMP_Y.map((y, l) => (
              <group key={l}>
                <mesh geometry={lampGeo} material={slot.lamps[l]} position={[HOUSING[0], HOUSING[1] + y, 0.2]} />
                <mesh geometry={visorGeo} material={housingMat} position={[HOUSING[0], HOUSING[1] + y + 0.22, 0.36]} />
              </group>
            ))}
            <mesh
              geometry={haloGeo}
              material={slot.halo}
              position={[HOUSING[0], HOUSING[1], 0.42]}
              renderOrder={2}
              ref={(el) => {
                halos.current[i] = el
              }}
            />

            {/* Kerbside repeater on the left sidewalk */}
            <mesh geometry={shortPoleGeo} material={poleMat} position={[SMALL[0], 1.6, 0]} />
            <mesh geometry={smallHousingGeo} material={housingMat} position={SMALL} />
            {LAMP_Y.map((y, l) => (
              <mesh
                key={l}
                geometry={smallLampGeo}
                material={slot.lamps[l]}
                position={[SMALL[0], SMALL[1] + y * 0.72, 0.15]}
              />
            ))}
            <mesh
              geometry={haloGeo}
              material={slot.halo}
              position={[SMALL[0], SMALL[1], 0.3]}
              scale={0.65}
              renderOrder={2}
              ref={(el) => {
                smallHalos.current[i] = el
              }}
            />

            {/* Road paint: stop line at the light, zebra just beyond it */}
            <mesh geometry={stopLineGeo} material={paintMat} position={[0, 0.015, 0]} />
            <mesh geometry={zebraGeo} material={paintMat} position={[0, 0.015, -3.5]} />
          </group>
        )
      })}
    </>
  )
}
