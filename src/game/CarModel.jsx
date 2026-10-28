/**
 * Low-poly box car shared by the player and the slow obstacle cars.
 * Nose points to -z (forward), tail lights at +z. Wheels touch y = 0.
 * Geometries and the shared materials live at module level so every car
 * instance reuses the same GPU buffers; only body and tail-light materials
 * are per car (their colour / glow changes per car).
 */
import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SIM } from './simulation.js'

const W = SIM.CAR_WIDTH
const L = SIM.CAR_LENGTH
const WHEEL_R = 0.36
const BODY_H = 0.6
const BODY_Y = 0.35 + BODY_H / 2 // body bottom sits just below the wheel tops

const bodyGeo = new THREE.BoxGeometry(W, BODY_H, L)
const cabinGeo = new THREE.BoxGeometry(W * 0.82, 0.55, L * 0.5)
const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 14)
const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.32, 10)
const tailGeo = new THREE.BoxGeometry(0.42, 0.14, 0.06)
const headGeo = new THREE.BoxGeometry(0.36, 0.12, 0.06)
const bumperGeo = new THREE.BoxGeometry(W * 1.02, 0.16, 0.12)

const cabinMat = new THREE.MeshStandardMaterial({ color: '#141a33', metalness: 0.5, roughness: 0.25 })
const wheelMat = new THREE.MeshStandardMaterial({ color: '#0d0f18', roughness: 0.9 })
const hubMat = new THREE.MeshStandardMaterial({ color: '#8a93b0', metalness: 0.6, roughness: 0.4 })
const bumperMat = new THREE.MeshStandardMaterial({ color: '#1b2140', roughness: 0.7 })
const headMat = new THREE.MeshStandardMaterial({
  color: '#fff6d8',
  emissive: '#fff1c2',
  emissiveIntensity: 1.2,
})

const WHEELS = [
  [-W / 2 + 0.08, WHEEL_R, -L * 0.32],
  [W / 2 - 0.08, WHEEL_R, -L * 0.32],
  [-W / 2 + 0.08, WHEEL_R, L * 0.32],
  [W / 2 - 0.08, WHEEL_R, L * 0.32],
]
const HALF_PI = Math.PI / 2

export function CarModel({ color = '#ffc531', tailRef, bodyRef, groupRef, ...groupProps }) {
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.45 }),
    [], // colour changes are applied below / via bodyRef, not by recreating
  )
  const tailMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ff4d5e',
        emissive: '#ff4d5e',
        emissiveIntensity: 0.6,
      }),
    [],
  )

  useLayoutEffect(() => {
    bodyMat.color.set(color)
  }, [bodyMat, color])

  useLayoutEffect(() => {
    if (tailRef) tailRef.current = tailMat
    if (bodyRef) bodyRef.current = bodyMat
  }, [tailRef, bodyRef, tailMat, bodyMat])

  useEffect(
    () => () => {
      bodyMat.dispose()
      tailMat.dispose()
    },
    [bodyMat, tailMat],
  )

  return (
    <group ref={groupRef} {...groupProps}>
      <mesh geometry={bodyGeo} material={bodyMat} position={[0, BODY_Y, 0]} />
      <mesh geometry={cabinGeo} material={cabinMat} position={[0, BODY_Y + BODY_H / 2 + 0.27, L * 0.06]} />
      <mesh geometry={bumperGeo} material={bumperMat} position={[0, 0.42, L / 2 + 0.02]} />
      <mesh geometry={bumperGeo} material={bumperMat} position={[0, 0.42, -L / 2 - 0.02]} />
      {WHEELS.map((p, i) => (
        <group key={i} position={p} rotation={[0, 0, HALF_PI]}>
          <mesh geometry={wheelGeo} material={wheelMat} />
          <mesh geometry={hubGeo} material={hubMat} />
        </group>
      ))}
      <mesh geometry={tailGeo} material={tailMat} position={[-W / 2 + 0.32, BODY_Y + 0.12, L / 2 + 0.01]} />
      <mesh geometry={tailGeo} material={tailMat} position={[W / 2 - 0.32, BODY_Y + 0.12, L / 2 + 0.01]} />
      <mesh geometry={headGeo} material={headMat} position={[-W / 2 + 0.3, BODY_Y + 0.1, -L / 2 - 0.01]} />
      <mesh geometry={headGeo} material={headMat} position={[W / 2 - 0.3, BODY_Y + 0.1, -L / 2 - 0.01]} />
    </group>
  )
}

export default CarModel
