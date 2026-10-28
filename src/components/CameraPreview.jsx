/**
 * Live, mirrored webcam preview with a simple skeleton overlay and the
 * current action chip. Variants: 'large' (start screen) and 'compact' (HUD).
 *
 * ── IN SIMPLE WORDS ──
 * A little "mirror" so players can see what the camera sees and whether
 * their lean or raised hand is being picked up. Lines are drawn over the
 * shoulders and arms; their colour changes with the gesture.
 *
 * ── BUSINESS RULES ──
 * - Hackathon brief §2 Camera Controls: the player steers with their body,
 *   so they need visual feedback of what the camera is reading.
 * - Line colours: green = neutral, amber = leaning, red = stop.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - Video and skeleton are painted onto ONE canvas and the canvas is
 *   mirrored with CSS scaleX(-1). Landmarks stay in raw image coords, so the
 *   overlay can never drift to the opposite side from the picture, which
 *   is what happens when the video and the overlay are flipped separately.
 * - It draws from the engine's single <video> (getVideo()) and never calls
 *   getUserMedia, so a second preview can't open a second camera stream.
 * - Drawing happens in requestAnimationFrame and reads the engine/store
 *   directly. Only the chip label and the camera status go through React,
 *   so the preview doesn't re-render React 60 times a second.
 * - Fixed aspect-ratio box with absolutely positioned layers: switching
 *   between placeholder and live video causes no layout shift.
 *
 * ── DO NOT ──
 * - Do not mirror the landmarks in JS as well as in CSS: that double flip
 *   puts the skeleton on the wrong side.
 * - Do not start the camera from here; the start screen's button does that.
 */
import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { getLatestPose, getVideo } from '../gesture/gestureEngine.js'
import './CameraPreview.css'

const LIVE = new Set(['ready', 'no-body'])

// Pose landmark pairs drawn as bones: shoulders, then each arm.
const BONES = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
]
const JOINTS = [11, 12, 13, 14, 15, 16]
const MIN_VIS = 0.5

const CHIP = {
  left: { label: '◀ Left', tone: 'lean' },
  right: { label: 'Right ▶', tone: 'lean' },
  stop: { label: '✋ Stop', tone: 'stop' },
  none: { label: 'Neutral', tone: 'none' },
}

function readColors(el) {
  const cs = getComputedStyle(el)
  const v = (name) => cs.getPropertyValue(name).trim()
  return { lean: v('--accent'), none: v('--green'), stop: v('--red'), joint: v('--text') }
}

function CameraIcon({ off }) {
  return (
    <svg className="cam-preview__icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h7A2.5 2.5 0 0 1 15 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 3 16.5v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="m15 10.5 4.6-2.8a.9.9 0 0 1 1.4.8v7a.9.9 0 0 1-1.4.8L15 13.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {off && <path d="M3.5 3.5 20.5 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="cam-preview__spinner icon-spin" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default function CameraPreview({ variant = 'large' }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const status = useGameStore((s) => s.camera.status)
  const message = useGameStore((s) => s.camera.message)
  const action = useGameStore((s) => s.input.action)

  const live = LIVE.has(status)
  const compact = variant === 'compact'

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const colors = readColors(root)
    let rafId = 0
    let lastTime = -1
    let lastPose = null
    let dirty = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        dirty = true
      }
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    const draw = () => {
      rafId = requestAnimationFrame(draw)
      if (!LIVE.has(useGameStore.getState().camera.status)) {
        dirty = true
        return
      }
      const video = getVideo()
      if (!video || video.readyState < 2 || !video.videoWidth) return
      const pose = getLatestPose()
      if (!dirty && video.currentTime === lastTime && pose === lastPose) return
      lastTime = video.currentTime
      lastPose = pose
      dirty = false

      // object-fit: cover, in raw (unmirrored) coordinates; CSS flips the canvas.
      const cw = canvas.width
      const ch = canvas.height
      const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight)
      const dw = video.videoWidth * scale
      const dh = video.videoHeight * scale
      const ox = (cw - dw) / 2
      const oy = (ch - dh) / 2
      ctx.drawImage(video, ox, oy, dw, dh)

      const lm = pose.landmarks
      if (!lm) return
      const pt = (i) => (lm[i] && (lm[i].visibility ?? 1) >= MIN_VIS ? [ox + lm[i].x * dw, oy + lm[i].y * dh] : null)
      const tone = CHIP[pose.action]?.tone ?? 'none'
      const unit = Math.max(1.5, cw / 160)

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = colors[tone]
      ctx.lineWidth = unit * 2
      ctx.beginPath()
      for (const [a, b] of BONES) {
        const p = pt(a)
        const q = pt(b)
        if (!p || !q) continue
        ctx.moveTo(p[0], p[1])
        ctx.lineTo(q[0], q[1])
      }
      ctx.stroke()

      ctx.fillStyle = colors.joint
      for (const i of JOINTS) {
        const p = pt(i)
        if (!p) continue
        ctx.beginPath()
        ctx.arc(p[0], p[1], unit * 1.6, 0, Math.PI * 2)
        ctx.fill()
      }

      const nose = pt(0)
      if (nose) {
        ctx.fillStyle = colors[tone]
        ctx.beginPath()
        ctx.arc(nose[0], nose[1], unit * 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      ro?.disconnect()
    }
  }, [])

  const chip = CHIP[action] ?? CHIP.none
  const showStepBack = status === 'no-body'
  const chipLabel = compact && showStepBack ? 'Step back' : chip.label
  const chipTone = compact && showStepBack ? 'warn' : chip.tone
  const errored = status === 'denied' || status === 'error'

  return (
    <div
      ref={rootRef}
      className={`cam-preview cam-preview--${compact ? 'compact' : 'large'}`}
      data-live={live || undefined}
      role="img"
      aria-label={live ? `Camera preview, gesture: ${chip.label}` : `Camera preview: ${message || 'camera off'}`}
    >
      <canvas ref={canvasRef} className="cam-preview__canvas" aria-hidden="true" />

      {!live && (
        <div className={`cam-preview__placeholder${errored ? ' is-error' : ''}`}>
          <CameraIcon off={errored || status === 'idle'} />
          <p className="cam-preview__message">
            {status === 'loading' && <Spinner />}
            <span>{message || 'Camera is off'}</span>
          </p>
        </div>
      )}

      {live && showStepBack && !compact && <p className="cam-preview__banner">{message}</p>}

      {live && (
        <span className={`chip cam-preview__chip cam-preview__chip--${chipTone}`} aria-hidden="true">
          {chipLabel}
        </span>
      )}
    </div>
  )
}
