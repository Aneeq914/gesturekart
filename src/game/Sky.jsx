/*
 * Dusk sky: a gradient dome (deep navy at the top, violet at the horizon) with
 * a low amber sun glow straight ahead, plus a sprinkle of stars. The dome
 * follows the camera so it never gets closer. Its horizon colour equals
 * SKY.horizon, which GameScene also uses as the fog colour, so the far end of
 * the road melts into the sky instead of ending at a visible edge.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export const SKY = {
  top: '#0b1020',
  mid: '#1b2350',
  horizon: '#3a3170',
  sun: '#ffc531',
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.2, h));
    col = mix(col, uTop, smoothstep(0.2, 0.65, h));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSun * (pow(s, 12.0) * 0.18 + pow(s, 90.0) * 0.35);
    col = mix(col, uSun, smoothstep(0.9988, 0.9993, s) * 0.85);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const RADIUS = 500
const STAR_COUNT = 260

export default function Sky() {
  const group = useRef()

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(SKY.top) },
          uMid: { value: new THREE.Color(SKY.mid) },
          uHorizon: { value: new THREE.Color(SKY.horizon) },
          uSun: { value: new THREE.Color(SKY.sun) },
          uSunDir: { value: new THREE.Vector3(0.18, 0.045, -1).normalize() },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(RADIUS, 32, 16), [])

  // Stars: fixed random points on the upper part of the dome, created once.
  const starGeometry = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const y = 0.18 + Math.random() * 0.82
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - y * y)
      pos[i * 3] = Math.cos(a) * r * RADIUS * 0.95
      pos[i * 3 + 1] = y * RADIUS * 0.95
      pos[i * 3 + 2] = Math.sin(a) * r * RADIUS * 0.95
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  const starMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#dfe6ff',
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.7,
        fog: false,
        depthWrite: false,
      }),
    [],
  )

  useFrame(({ camera }) => {
    if (group.current) group.current.position.copy(camera.position)
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} renderOrder={-2} frustumCulled={false} />
      <points geometry={starGeometry} material={starMaterial} renderOrder={-1} frustumCulled={false} />
    </group>
  )
}
