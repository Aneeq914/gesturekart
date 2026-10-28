/**
 * The player's amber car. Follows the simulation's smoothed x and distance,
 * leans and yaws slightly while gliding between lanes, and its tail lights
 * flare while braking. All motion is ref mutation inside useFrame (no React
 * re-renders per frame).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LANES } from './rules.js'
import { CarModel } from './CarModel.jsx'

const MAX_ROLL = 0.12
const MAX_YAW = 0.1

function makeGlowTexture() {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const clamp = (v, m) => Math.max(-m, Math.min(m, v))

export default function PlayerCar({ worldRef }) {
  const groupRef = useRef(null)
  const tailRef = useRef(null)

  const glow = useMemo(() => {
    const map = makeGlowTexture()
    const geo = new THREE.PlaneGeometry(1, 1)
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffc531',
      map,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geo, mat, map }
  }, [])

  useEffect(
    () => () => {
      glow.geo.dispose()
      glow.mat.dispose()
      if (glow.map) glow.map.dispose()
    },
    [glow],
  )

  useFrame((_, delta) => {
    const w = worldRef.current
    const g = groupRef.current
    if (!w || !g) return
    const dt = Math.min(delta, 0.05)
    const k = 1 - Math.exp(-10 * dt)

    g.position.set(w.x, 0, -w.distance)

    // Gliding right (+x): body rolls left (positive z) and the nose turns to +x (negative y).
    const diff = LANES[w.laneIndex] - w.x
    g.rotation.z += (clamp(diff * 0.06, MAX_ROLL) - g.rotation.z) * k
    g.rotation.y += (clamp(-diff * 0.05, MAX_YAW) - g.rotation.y) * k

    const tail = tailRef.current
    if (tail) tail.emissiveIntensity += ((w.braking ? 3 : 0.6) - tail.emissiveIntensity) * (1 - Math.exp(-14 * dt))
  })

  return (
    <group ref={groupRef}>
      <CarModel color="#ffc531" tailRef={tailRef} />
      <mesh
        geometry={glow.geo}
        material={glow.mat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        scale={[3.2, 6, 1]}
        renderOrder={1}
      />
    </group>
  )
}
