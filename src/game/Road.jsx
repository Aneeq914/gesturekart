/**
 * Road: asphalt, lane markings, kerbs, sidewalks and the ground, following the car.
 * Uniform strips simply ride along with the car (z = -distance). Repeating marks
 * (lane dashes, sidewalk seams) sit in a group that snaps forward by one dash
 * period, so they appear to scroll past at the car's speed without any per-frame
 * instance updates. Convention: world s maps to z = -s, forward is -z.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LANES } from './rules.js'

const LANE_W = LANES[1] - LANES[0]
const ROAD_HALF = LANES[LANES.length - 1] + LANE_W / 2 // outer edge of the outer lanes
const SHOULDER = 1
const KERB_IN = ROAD_HALF + SHOULDER
const KERB_W = 0.4
const KERB_H = 0.22
const WALK_IN = KERB_IN + KERB_W
const WALK_OUT = 9
const WALK_H = 0.18 // Scenery.jsx stands lamps and trees on this height
const WALK_W = WALK_OUT - WALK_IN

const STRIP_LEN = 400
const STRIP_CENTER = -140 // local z: covers ~60 m behind to ~340 m ahead of the car
const DASH_LEN = 3
const DASH_PERIOD = 9
const SEAM_PERIOD = 3 // must divide DASH_PERIOD, both live in the same snapped group
const MARK_FROM = -45 // local s range of the repeating marks
const MARK_TO = 300
const MARK_Y = 0.012
const EDGE_X = ROAD_HALF + 0.1

// Lane dividers sit halfway between neighbouring lane centres.
const DIVIDERS = LANES.slice(1).map((x, i) => (x + LANES[i]) / 2)

const range = (from, to, step) => {
  const out = []
  for (let s = from; s <= to; s += step) out.push(s)
  return out
}
const DASH_S = range(MARK_FROM, MARK_TO, DASH_PERIOD)
const SEAM_S = range(MARK_FROM, MARK_TO, SEAM_PERIOD)

const flat = (geo) => geo.rotateX(-Math.PI / 2)

export default function Road({ worldRef }) {
  const followRef = useRef()
  const snapRef = useRef()
  const dashRef = useRef()
  const seamRef = useRef()

  const res = useMemo(() => {
    const markOffset = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }
    return {
      roadGeo: flat(new THREE.PlaneGeometry(KERB_IN * 2, STRIP_LEN)),
      groundGeo: flat(new THREE.PlaneGeometry(700, 900)),
      walkGeo: new THREE.BoxGeometry(WALK_W, WALK_H, STRIP_LEN),
      kerbGeo: new THREE.BoxGeometry(KERB_W, KERB_H, STRIP_LEN),
      edgeGeo: flat(new THREE.PlaneGeometry(0.16, STRIP_LEN)),
      dashGeo: flat(new THREE.PlaneGeometry(0.16, DASH_LEN)),
      seamGeo: flat(new THREE.PlaneGeometry(WALK_W, 0.07)),
      roadMat: new THREE.MeshLambertMaterial({ color: '#1a1f33' }),
      groundMat: new THREE.MeshLambertMaterial({ color: '#0e1328' }),
      walkMat: new THREE.MeshLambertMaterial({ color: '#2a3150' }),
      kerbMat: new THREE.MeshLambertMaterial({ color: '#8d93ad' }),
      edgeMat: new THREE.MeshBasicMaterial({ color: '#d9a62a', ...markOffset }),
      dashMat: new THREE.MeshBasicMaterial({ color: '#e8ecf7', ...markOffset }),
      seamMat: new THREE.MeshBasicMaterial({ color: '#1d233d', ...markOffset }),
    }
  }, [])

  const dashCount = DIVIDERS.length * DASH_S.length
  const seamCount = 2 * SEAM_S.length

  // Repeating marks are static inside the snapped group: place them once.
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    let i = 0
    for (const x of DIVIDERS) {
      for (const s of DASH_S) dashRef.current.setMatrixAt(i++, m.makeTranslation(x, MARK_Y, -s))
    }
    dashRef.current.instanceMatrix.needsUpdate = true

    i = 0
    const seamX = WALK_IN + WALK_W / 2
    for (const side of [-1, 1]) {
      for (const s of SEAM_S) seamRef.current.setMatrixAt(i++, m.makeTranslation(side * seamX, WALK_H + 0.004, -s))
    }
    seamRef.current.instanceMatrix.needsUpdate = true
  }, [])

  useFrame(() => {
    const d = worldRef.current?.distance ?? 0
    followRef.current.position.z = -d
    snapRef.current.position.z = -Math.floor(d / DASH_PERIOD) * DASH_PERIOD
  })

  const walkX = WALK_IN + WALK_W / 2
  const kerbX = KERB_IN + KERB_W / 2

  return (
    <group>
      <group ref={followRef}>
        <mesh geometry={res.groundGeo} material={res.groundMat} position={[0, -0.02, -300]} />
        <mesh geometry={res.roadGeo} material={res.roadMat} position={[0, 0, STRIP_CENTER]} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={res.walkGeo} material={res.walkMat} position={[side * walkX, WALK_H / 2, STRIP_CENTER]} />
            <mesh geometry={res.kerbGeo} material={res.kerbMat} position={[side * kerbX, KERB_H / 2, STRIP_CENTER]} />
            <mesh geometry={res.edgeGeo} material={res.edgeMat} position={[side * EDGE_X, MARK_Y, STRIP_CENTER]} />
          </group>
        ))}
      </group>

      <group ref={snapRef}>
        <instancedMesh ref={dashRef} args={[res.dashGeo, res.dashMat, dashCount]} frustumCulled={false} />
        <instancedMesh ref={seamRef} args={[res.seamGeo, res.seamMat, seamCount]} frustumCulled={false} />
      </group>
    </group>
  )
}
