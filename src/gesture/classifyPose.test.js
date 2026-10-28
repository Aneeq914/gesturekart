import { describe, it, expect } from 'vitest'
import {
  ASPECT_RATIO,
  LEFT_SHOULDER,
  LEFT_WRIST,
  NOSE,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  STABLE_FRAMES,
  createGestureClassifier,
  shoulderAngle,
} from './classifyPose.js'

// Build a synthetic 33-point pose in RAW (unmirrored) image coords.
// `tiltDeg` > 0 lowers the image-right shoulder (the player's own left shoulder).
function pose({ tiltDeg = 0, wristUp = false, visibility = 1, shoulderSpan = 0.3 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.8, z: 0, visibility: 1 }))
  const cx = 0.5
  const cy = 0.55
  const half = shoulderSpan / 2
  // Convert the pixel-space angle back to a normalized dy over the shoulder width.
  const dy = Math.tan((tiltDeg * Math.PI) / 180) * shoulderSpan * ASPECT_RATIO
  // In a raw selfie frame the player's RIGHT shoulder (label 12) is on the image LEFT.
  lm[RIGHT_SHOULDER] = { x: cx - half, y: cy - dy / 2, z: 0, visibility }
  lm[LEFT_SHOULDER] = { x: cx + half, y: cy + dy / 2, z: 0, visibility }
  lm[NOSE] = { x: cx, y: 0.35, z: 0, visibility: 1 }
  lm[LEFT_WRIST] = { x: cx + 0.25, y: 0.85, z: 0, visibility: 1 }
  lm[RIGHT_WRIST] = { x: cx - 0.25, y: wristUp ? 0.2 : 0.85, z: 0, visibility: 1 }
  return lm
}

// Feed the same pose n times and return every result.
function feed(c, lm, n) {
  return Array.from({ length: n }, () => c.update(lm))
}

describe('shoulderAngle', () => {
  it('measures the tilt in pixel-true degrees', () => {
    expect(shoulderAngle(pose({ tiltDeg: 20 }))).toBeCloseTo(20, 5)
    expect(shoulderAngle(pose({ tiltDeg: -15 }))).toBeCloseTo(-15, 5)
  })

  it('ignores which shoulder carries which label (mirror-proof)', () => {
    const lm = pose({ tiltDeg: 20 })
    const swapped = [...lm]
    swapped[LEFT_SHOULDER] = lm[RIGHT_SHOULDER]
    swapped[RIGHT_SHOULDER] = lm[LEFT_SHOULDER]
    expect(shoulderAngle(swapped)).toBeCloseTo(20, 5)
  })
})

describe('createGestureClassifier', () => {
  it('returns none for null, undefined or empty landmarks', () => {
    const c = createGestureClassifier()
    expect(c.update(null)).toBe('none')
    expect(c.update(undefined)).toBe('none')
    expect(c.update([])).toBe('none')
  })

  it('returns none for level shoulders', () => {
    const c = createGestureClassifier()
    expect(feed(c, pose({ tiltDeg: 0 }), 20).every((a) => a === 'none')).toBe(true)
  })

  it('returns left when the player leans to THEIR left (image-right shoulder lower), after the stability frames', () => {
    const c = createGestureClassifier()
    const results = feed(c, pose({ tiltDeg: 20 }), 10)
    expect(results[0]).toBe('none') // one frame is never enough
    const first = results.indexOf('left')
    expect(first).toBeGreaterThanOrEqual(STABLE_FRAMES - 1)
    expect(first).toBeLessThanOrEqual(STABLE_FRAMES + 2)
    expect(results.slice(first).every((a) => a === 'left')).toBe(true)
  })

  it('returns right for the mirror case (image-left shoulder lower)', () => {
    const c = createGestureClassifier()
    const results = feed(c, pose({ tiltDeg: -20 }), 10)
    expect(results[0]).toBe('none')
    expect(results.at(-1)).toBe('right')
    expect(results).not.toContain('left')
  })

  it('does not lean below the enter threshold', () => {
    const c = createGestureClassifier()
    expect(feed(c, pose({ tiltDeg: 10 }), 20)).not.toContain('left')
    expect(feed(c, pose({ tiltDeg: -10 }), 20)).not.toContain('right')
  })

  it('has hysteresis: 9° after leaning stays leaning, 3° releases', () => {
    const c = createGestureClassifier()
    feed(c, pose({ tiltDeg: 20 }), 10)
    expect(feed(c, pose({ tiltDeg: 9 }), 20).every((a) => a === 'left')).toBe(true)
    expect(feed(c, pose({ tiltDeg: 3 }), 20).at(-1)).toBe('none')

    const r = createGestureClassifier()
    feed(r, pose({ tiltDeg: -20 }), 10)
    expect(feed(r, pose({ tiltDeg: -9 }), 20).every((a) => a === 'right')).toBe(true)
    expect(feed(r, pose({ tiltDeg: -3 }), 20).at(-1)).toBe('none')
  })

  it('ignores a single jittery frame', () => {
    const c = createGestureClassifier()
    feed(c, pose({ tiltDeg: 0 }), 5)
    expect(c.update(pose({ tiltDeg: 40 }))).toBe('none')
    expect(feed(c, pose({ tiltDeg: 0 }), 5)).not.toContain('left')
  })

  it('returns stop for a wrist above the nose, even while leaning', () => {
    const c = createGestureClassifier()
    feed(c, pose({ tiltDeg: 20 }), 10)
    const results = feed(c, pose({ tiltDeg: 20, wristUp: true }), 10)
    expect(results.at(-1)).toBe('stop')
    expect(results.indexOf('stop')).toBeLessThanOrEqual(STABLE_FRAMES)
  })

  it('returns stop with either wrist', () => {
    const c = createGestureClassifier()
    const lm = pose()
    lm[LEFT_WRIST] = { ...lm[LEFT_WRIST], y: 0.2 }
    expect(feed(c, lm, 5).at(-1)).toBe('stop')
  })

  it('ignores a raised wrist the model cannot see well', () => {
    const c = createGestureClassifier()
    const lm = pose({ wristUp: true })
    lm[RIGHT_WRIST] = { ...lm[RIGHT_WRIST], visibility: 0.2 }
    expect(feed(c, lm, 10)).not.toContain('stop')
  })

  it('returns none when shoulder visibility is low', () => {
    const c = createGestureClassifier()
    expect(feed(c, pose({ tiltDeg: 25, visibility: 0.3 }), 10).every((a) => a === 'none')).toBe(true)

    const lean = createGestureClassifier()
    feed(lean, pose({ tiltDeg: 25 }), 10)
    expect(feed(lean, pose({ tiltDeg: 25, visibility: 0.3 }), 10).at(-1)).toBe('none')
  })

  it('returns none when the player is side-on (shoulders almost overlap)', () => {
    const c = createGestureClassifier()
    expect(feed(c, pose({ tiltDeg: 60, shoulderSpan: 0.02 }), 10)).not.toContain('left')
  })

  it('clears its smoothing when the body disappears', () => {
    const c = createGestureClassifier()
    feed(c, pose({ tiltDeg: 30 }), 10)
    expect(c.update(null)).toBe('none')
    // A new, level player must not inherit the old lean.
    expect(feed(c, pose({ tiltDeg: 0 }), 5)).not.toContain('left')
  })

  it('reset() forgets the current action', () => {
    const c = createGestureClassifier()
    feed(c, pose({ tiltDeg: 20 }), 10)
    c.reset()
    expect(c.update(pose({ tiltDeg: 0 }))).toBe('none')
  })
})
