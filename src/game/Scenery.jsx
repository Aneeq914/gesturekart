/**
 * Scenery: the "toy city at dusk" beside the road: buildings with glowing
 * windows, a distant skyline, street lamps and trees. Everything is laid out
 * once (deterministic seed) along a SPAN-metre stretch and recycled: when an
 * item falls BEHIND metres behind the car it jumps SPAN metres ahead, past the
 * fog, so nothing visibly pops. Only items that actually jump get their
 * instance matrix rewritten. Convention: world s maps to z = -s, forward is -z.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SPAN = 300 // recycle length; far end (~260 m ahead) is beyond the fog
const BEHIND = 40 // items wrap once this far behind the car
const BUILD_IN = 11 // |x| of the road-facing building walls
const WALK_H = 0.18 // sidewalk height, matches Road.jsx
const LAMP_X = 7.5
const LAMP_EVERY = 30 // must divide SPAN so spacing stays even across the wrap
const TREE_X = 8.3

const BUILDING_COLORS = ['#2b3566', '#3a3f7a', '#24305e', '#47407a', '#323a6e']
const SKYLINE_COLORS = ['#151b38', '#1a2146', '#181d3f']
const NEON_COLORS = ['#6ea8ff', '#ff4d5e', '#2ee6a0', '#ffc531']
const CROWN_COLORS = ['#1f8f7a', '#23a08a', '#187563']

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)]

/** Fill SPAN metres per side with blocks of random length, scaled to fit exactly. */
function row(rnd, minLen, lenRange, minGap, gapRange) {
  const items = []
  let pos = 0
  while (pos < SPAN) {
    const len = minLen + rnd() * lenRange
    items.push({ start: pos, len })
    pos += len + minGap + rnd() * gapRange
  }
  const k = SPAN / pos
  return items.map((b) => ({ s0: (b.start + b.len / 2) * k, len: b.len * k }))
}

function buildCity() {
  const rnd = mulberry32(20261028)
  const buildings = []
  const windows = []

  for (const side of [-1, 1]) {
    for (const { s0, len } of row(rnd, 8, 9, 1.5, 3)) {
      const w = 6 + rnd() * 5
      let h = 6 + rnd() * 18
      if (rnd() < 0.15) h += 12
      const b = {
        s0, len, w, h,
        x: side * (BUILD_IN + w / 2),
        color: new THREE.Color(pick(rnd, BUILDING_COLORS)),
        w0: windows.length,
      }
      const dark = rnd() < 0.15
      const wx = side * (BUILD_IN - 0.03)
      const nCols = Math.max(1, Math.floor((len - 1.2) / 2.4))
      const nRows = Math.floor((h - 2) / 3)
      for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
          const lit = rnd()
          const tone = rnd()
          const dim = 0.6 + rnd() * 0.4
          if (dark || lit > 0.42) continue
          const hex = tone < 0.55 ? '#ffc531' : tone < 0.85 ? '#ffe7a3' : '#6ea8ff'
          windows.push({
            x: wx, y: 2.2 + r * 3, ds: (c - (nCols - 1) / 2) * 2.4,
            sx: 0.06, sy: 1.3, sz: 1.1,
            color: new THREE.Color(hex).multiplyScalar(dim),
          })
        }
      }
      // Some roofs get a thin neon trim along the road-facing edge.
      if (h > 10 && rnd() < 0.25) {
        windows.push({
          x: wx, y: h - 0.35, ds: 0,
          sx: 0.1, sy: 0.2, sz: len * 0.92,
          color: new THREE.Color(pick(rnd, NEON_COLORS)).multiplyScalar(0.8),
        })
      }
      b.w1 = windows.length
      buildings.push(b)
    }

    // Distant skyline silhouettes, no windows.
    for (const { s0, len } of row(rnd, 14, 16, 4, 8)) {
      const w = 10 + rnd() * 14
      buildings.push({
        s0, len, w,
        h: 22 + rnd() * 33,
        x: side * (45 + rnd() * 30 + w / 2),
        color: new THREE.Color(pick(rnd, SKYLINE_COLORS)),
        w0: windows.length,
        w1: windows.length,
      })
    }
  }

  // Lamps and trees alternate sides, staggered by half a lamp period.
  const lamps = []
  const trees = []
  for (let i = 0; i < SPAN / LAMP_EVERY; i++) {
    lamps.push({ s0: i * LAMP_EVERY, side: -1 })
    lamps.push({ s0: i * LAMP_EVERY + LAMP_EVERY / 2, side: 1 })
    for (const [s0, side] of [[i * LAMP_EVERY + LAMP_EVERY / 2, -1], [i * LAMP_EVERY, 1]]) {
      const scale = 0.8 + rnd() * 0.5
      const color = new THREE.Color(pick(rnd, CROWN_COLORS))
      if (rnd() < 0.2) continue // leave a few gaps
      trees.push({ s0, side, scale, color })
    }
  }

  return { buildings, windows, lamps, trees }
}

const dummy = new THREE.Object3D()

function setAt(mesh, i, x, y, z, sx = 1, sy = 1, sz = 1) {
  dummy.position.set(x, y, z)
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

/** Moves every item whose wrap count changed; returns true if anything moved. */
function recycle(items, wraps, base, place) {
  let moved = false
  for (let i = 0; i < items.length; i++) {
    const k = Math.ceil((base - items[i].s0) / SPAN)
    if (k === wraps[i]) continue
    wraps[i] = k
    place(i, items[i].s0 + k * SPAN)
    moved = true
  }
  return moved
}

export default function Scenery({ worldRef }) {
  const refs = {
    building: useRef(),
    window: useRef(),
    pole: useRef(),
    arm: useRef(),
    bulb: useRef(),
    glow: useRef(),
    trunk: useRef(),
    crown: useRef(),
  }

  const city = useMemo(buildCity, [])

  const res = useMemo(() => ({
    boxGeo: new THREE.BoxGeometry(1, 1, 1),
    poleGeo: new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6).translate(0, 2.6, 0),
    armGeo: new THREE.BoxGeometry(1.4, 0.08, 0.08),
    bulbGeo: new THREE.BoxGeometry(0.5, 0.12, 0.28),
    glowGeo: new THREE.CircleGeometry(2.4, 24).rotateX(-Math.PI / 2),
    trunkGeo: new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6).translate(0, 0.7, 0),
    crownGeo: new THREE.IcosahedronGeometry(1, 0),
    buildingMat: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    windowMat: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    poleMat: new THREE.MeshLambertMaterial({ color: '#4a5170' }),
    bulbMat: new THREE.MeshBasicMaterial({ color: '#ffe7a3' }),
    glowMat: new THREE.MeshBasicMaterial({
      color: '#ffc531',
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    trunkMat: new THREE.MeshLambertMaterial({ color: '#4b3d3a' }),
    crownMat: new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }),
  }), [])

  const state = useMemo(() => ({
    bWraps: new Float64Array(city.buildings.length).fill(NaN),
    lWraps: new Float64Array(city.lamps.length).fill(NaN),
    tWraps: new Float64Array(city.trees.length).fill(NaN),
  }), [city])

  const placeAll = useMemo(() => {
    const { buildings, windows, lamps, trees } = city
    const placeBuilding = (i, s) => {
      const b = buildings[i]
      setAt(refs.building.current, i, b.x, b.h / 2, -s, b.w, b.h, b.len)
      for (let j = b.w0; j < b.w1; j++) {
        const w = windows[j]
        setAt(refs.window.current, j, w.x, w.y, -(s + w.ds), w.sx, w.sy, w.sz)
      }
    }
    const placeLamp = (i, s) => {
      const { side } = lamps[i]
      setAt(refs.pole.current, i, side * LAMP_X, WALK_H, -s)
      setAt(refs.arm.current, i, side * (LAMP_X - 0.7), WALK_H + 5.1, -s)
      setAt(refs.bulb.current, i, side * (LAMP_X - 1.3), WALK_H + 5.02, -s)
      setAt(refs.glow.current, i, side * (LAMP_X - 1.3), 0.21, -s)
    }
    const placeTree = (i, s) => {
      const t = trees[i]
      setAt(refs.trunk.current, i, t.side * TREE_X, WALK_H, -s, t.scale, t.scale, t.scale)
      setAt(refs.crown.current, i, t.side * TREE_X, WALK_H + 1.4 * t.scale + 0.7 * t.scale, -s,
        t.scale, t.scale * 1.15, t.scale)
    }
    const flag = (keys) => keys.forEach((k) => { refs[k].current.instanceMatrix.needsUpdate = true })

    return (d) => {
      const base = d - BEHIND
      if (recycle(buildings, state.bWraps, base, placeBuilding)) flag(['building', 'window'])
      if (recycle(lamps, state.lWraps, base, placeLamp)) flag(['pole', 'arm', 'bulb', 'glow'])
      if (recycle(trees, state.tWraps, base, placeTree)) flag(['trunk', 'crown'])
    }
    // refs are stable objects created by useRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, state])

  // Colours once, and an initial placement so the very first frame is correct.
  useLayoutEffect(() => {
    city.buildings.forEach((b, i) => refs.building.current.setColorAt(i, b.color))
    city.windows.forEach((w, i) => refs.window.current.setColorAt(i, w.color))
    city.trees.forEach((t, i) => refs.crown.current.setColorAt(i, t.color))
    for (const k of ['building', 'window', 'crown']) {
      if (refs[k].current.instanceColor) refs[k].current.instanceColor.needsUpdate = true
    }
    placeAll(worldRef.current?.distance ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, placeAll])

  useFrame(() => placeAll(worldRef.current?.distance ?? 0))

  const nB = city.buildings.length
  const nW = Math.max(1, city.windows.length)
  const nL = city.lamps.length
  const nT = city.trees.length

  return (
    <group>
      <instancedMesh ref={refs.building} args={[res.boxGeo, res.buildingMat, nB]} frustumCulled={false} />
      <instancedMesh ref={refs.window} args={[res.boxGeo, res.windowMat, nW]} frustumCulled={false} />
      <instancedMesh ref={refs.pole} args={[res.poleGeo, res.poleMat, nL]} frustumCulled={false} />
      <instancedMesh ref={refs.arm} args={[res.armGeo, res.poleMat, nL]} frustumCulled={false} />
      <instancedMesh ref={refs.bulb} args={[res.bulbGeo, res.bulbMat, nL]} frustumCulled={false} />
      <instancedMesh ref={refs.glow} args={[res.glowGeo, res.glowMat, nL]} frustumCulled={false} />
      <instancedMesh ref={refs.trunk} args={[res.trunkGeo, res.trunkMat, nT]} frustumCulled={false} />
      <instancedMesh ref={refs.crown} args={[res.crownGeo, res.crownMat, nT]} frustumCulled={false} />
    </group>
  )
}
