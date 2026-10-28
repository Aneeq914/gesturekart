/**
 * In-game HUD: a night-time car instrument cluster drawn over the 3D road.
 *
 * ── IN SIMPLE WORDS ──
 * This is the car's dashboard. A speedometer sits under your car, a ring
 * counts down the time, the score glows top-left, two arrow lamps blink
 * like indicators when you switch lanes, and a "BRAKE" lamp lights when you
 * stop. Points you win or lose drop in from the top like a phone
 * notification. The webcam view sits bottom-right like a rear-view screen.
 *
 * ── BUSINESS RULES ──
 * - Score starts at START_SCORE and the round lasts GAME_DURATION (rules.js).
 * - The speedometer's full scale is the cruise speed, kmh(CRUISE_SPEED), so
 *   a full arc means "driving normally" and an empty arc means "stopped".
 * - The clock turns red at LOW_TIME seconds so players know the round is
 *   about to end.
 * - Players can switch the webcam off/on mid-round; the keyboard always
 *   works (brief §2 Camera Controls, keyboard fallback).
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - Each widget subscribes to ONE store field. A score change must not
 *   re-render the clock, and a gesture change must not re-render the score;
 *   merging them makes the HUD re-render every frame during play.
 * - The speedometer is passed into the control cluster as `children`, so a
 *   lamp change (input.action) does not re-render the gauge, and a speed
 *   change does not re-render the lamps.
 * - `.hud__top` wraps the whole cluster (score, time AND speed) because the
 *   e2e scripts read its innerText with /(\d+)\s*km/. `.hud__control` must
 *   keep the visible word "Camera" or "Keyboard" (no CSS text-transform on
 *   it: innerText applies the transform and would print "KEYBOARD").
 * - The layer is `pointer-events: none`; only tooltips and the camera bezel
 *   opt back in, so the HUD never swallows taps meant for the game.
 *
 * ── DO NOT ──
 * - Do not move the camera toggle's Space guard or stopPropagation it: Space
 *   must still reach window, where it is the brake key.
 * - Do not rename `hud__top`, `hud__control` or `cam-toggle`; test scripts
 *   query them.
 * - Do not place anything over the middle of the screen: the road ahead,
 *   lights and blocking cars live there.
 */
import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { CRUISE_SPEED, GAME_DURATION, START_SCORE, kmh } from '../game/rules.js'
import { startCamera, stopCamera } from '../gesture/gestureEngine.js'
import CameraPreview from './CameraPreview.jsx'
import Tooltip from './Tooltip.jsx'
import Kbd from './Kbd.jsx'
import { formatClock, formatPoints, toneOf } from './format.js'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  KeyboardIcon,
  SpinnerIcon,
} from './icons.jsx'
import './HUD.css'

const LOW_TIME = 10 // seconds; the clock turns red at or below this
const TOAST_MS = 1600
const TOAST_EXIT_MS = 260 // matches the hud-toast-out animation in HUD.css

const clamp01 = (n) => Math.min(1, Math.max(0, n))

// Each piece below subscribes to ONE store field, so a score change does not
// re-render the clock, and a gesture change does not re-render the score.

function ScoreStat() {
  const score = useGameStore((s) => s.score)
  return (
    <Tooltip
      side="bottom"
      content={`You started at ${START_SCORE}. Stop at red lights and dodge blocking cars to earn points. Jumping reds and crashing cost points.`}
    >
      <div className="hud-score" tabIndex={0}>
        <span className="hud-label">Score</span>
        {/* key replays the small "pop" whenever the score changes */}
        <span key={score} className="hud-score__value">
          {score}
        </span>
      </div>
    </Tooltip>
  )
}

// Time ring: an SVG circle whose stroke drains over GAME_DURATION.
// pathLength=100 lets the dash offset be a plain percentage.
function TimeStat() {
  const timeLeft = useGameStore((s) => s.timeLeft)
  const low = timeLeft <= LOW_TIME
  const left = clamp01(timeLeft / GAME_DURATION) * 100
  return (
    <div className="timering" data-low={low || undefined}>
      <svg className="timering__dial" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle className="timering__track" cx="32" cy="32" r="28" />
        <circle
          className="timering__value"
          cx="32"
          cy="32"
          r="28"
          pathLength="100"
          strokeDasharray="100 100"
          style={{ strokeDashoffset: 100 - left }}
        />
      </svg>
      <span className="timering__read">
        <span className="timering__clock">
          <span className="sr-only">{timeLeft} seconds left, </span>
          <span aria-hidden="true">{formatClock(timeLeft)}</span>
        </span>
        <span className="hud-label timering__label" aria-hidden="true">
          Time
        </span>
      </span>
    </div>
  )
}

// Speedometer geometry, in the SVG's 200 × 106 viewBox. Centre sits at the
// bottom middle; the arc sweeps 180° from left (0 km/h) to right (max).
const MAX_KMH = kmh(CRUISE_SPEED)
const CX = 100
const CY = 100
const R = 86
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`
const TICK_STEP = 5 // km/h between ticks; every 4th tick is a major one
const TICKS = Array.from({ length: Math.floor(MAX_KMH / TICK_STEP) + 1 }, (_, i) => {
  const value = i * TICK_STEP
  const a = Math.PI - (value / MAX_KMH) * Math.PI
  const major = i % 4 === 0
  const r1 = 76
  const r0 = major ? 66 : 71
  const p = (r) => [+(CX + r * Math.cos(a)).toFixed(2), +(CY - r * Math.sin(a)).toFixed(2)]
  const [x1, y1] = p(r0)
  const [x2, y2] = p(r1)
  return { value, major, x1, y1, x2, y2 }
})

function SpeedGauge() {
  const speed = useGameStore((s) => s.speed)
  const braking = useGameStore((s) => s.input.action === 'stop')
  const fill = clamp01(speed / MAX_KMH) * 100
  return (
    <div className="gauge" data-braking={braking || undefined}>
      <svg className="gauge__dial" viewBox="0 0 200 106" aria-hidden="true" focusable="false">
        <path className="gauge__track" d={ARC} pathLength="100" />
        {TICKS.map((t) => (
          <line
            key={t.value}
            className="gauge__tick"
            data-major={t.major || undefined}
            data-lit={t.value <= speed || undefined}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
          />
        ))}
        <path
          className="gauge__arc"
          d={ARC}
          pathLength="100"
          strokeDasharray="100 100"
          style={{ strokeDashoffset: 100 - fill }}
        />
      </svg>
      <div className="gauge__read">
        <span className="sr-only">Speed </span>
        <span className="gauge__num">{Math.round(speed)}</span>
        <span className="gauge__unit">km/h</span>
      </div>
    </div>
  )
}

const CONTROL_LABEL = {
  left: 'Lane left',
  right: 'Lane right',
  stop: 'Braking',
  none: 'Cruising',
}

const SOURCE_TIP = {
  camera: 'Driving with your webcam: lean to switch lanes, raise a hand to brake.',
  keyboard: 'Driving with the keyboard: ← → or A / D switch lanes, Space / ↓ / S brakes.',
}

/**
 * Indicator lamps + BRAKE telltale + input source, flanking the speedometer
 * (passed in as children so speed changes don't re-render the lamps).
 */
function ControlIndicator({ children }) {
  const action = useGameStore((s) => s.input.action)
  const source = useGameStore((s) => s.input.source)
  const isKeyboard = source === 'keyboard'
  const label = CONTROL_LABEL[action] ?? CONTROL_LABEL.none

  return (
    <div className="hud__control" data-action={action}>
      <span className="sr-only">{label}, </span>

      <div className="hud__wing hud__wing--left">
        <Tooltip side="top" content={SOURCE_TIP[isKeyboard ? 'keyboard' : 'camera']}>
          <span className="telltale telltale--source" data-source={source} tabIndex={0}>
            {isKeyboard ? <KeyboardIcon size={12} strokeWidth={2.2} /> : <CameraIcon size={12} strokeWidth={2.2} />}
            {isKeyboard ? 'Keyboard' : 'Camera'}
          </span>
        </Tooltip>
        <span className="lamp" data-on={action === 'left' || undefined} aria-hidden="true">
          <ArrowLeftIcon size={16} strokeWidth={2.8} />
        </span>
      </div>

      {children}

      <div className="hud__wing hud__wing--right">
        <span className="telltale telltale--brake" data-on={action === 'stop' || undefined} aria-hidden="true">
          Brake
        </span>
        <span className="lamp" data-on={action === 'right' || undefined} aria-hidden="true">
          <ArrowRightIcon size={16} strokeWidth={2.8} />
        </span>
      </div>
    </div>
  )
}

function Toast({ event }) {
  const [stage, setStage] = useState('in') // 'in' -> 'out' -> 'gone'

  useEffect(() => {
    const out = setTimeout(() => setStage('out'), TOAST_MS)
    const gone = setTimeout(() => setStage('gone'), TOAST_MS + TOAST_EXIT_MS)
    return () => {
      clearTimeout(out)
      clearTimeout(gone)
    }
  }, [])

  if (stage === 'gone') return null
  const tone = toneOf(event.points)
  return (
    <div className="toast" data-tone={tone} data-stage={stage}>
      <span className="toast__icon">
        {tone === 'good' ? <CheckIcon size={16} strokeWidth={2.8} /> : <AlertIcon size={16} />}
      </span>
      <span className="toast__text">
        <span className="toast__label">{event.label}</span>
        <span className="toast__kind">{tone === 'good' ? 'Reward' : tone === 'bad' ? 'Penalty' : 'Event'}</span>
      </span>
      <span className="toast__points">{formatPoints(event.points)}</span>
    </div>
  )
}

function EventToast() {
  const lastEvent = useGameStore((s) => s.lastEvent)
  return (
    <div className="hud__toasts" role="status" aria-live="polite" aria-atomic="true">
      {/* key = event id: every new event remounts the toast and restarts its timer */}
      {lastEvent && <Toast key={lastEvent.id} event={lastEvent} />}
    </div>
  )
}

const CAMERA_ON = new Set(['ready', 'no-body'])

// Space (and the legacy 'Spacebar' key name) is the brake key. A focused
// <button> treats Space as "click" (on keyup in most browsers), so without
// this guard braking could also flip the camera. preventDefault only cancels
// the button's own activation: the event still bubbles to window, where
// useControls reads it as a brake. Enter still toggles for keyboard users.
const isSpace = (e) => e.key === ' ' || e.key === 'Spacebar'
const swallowSpace = (e) => {
  if (isSpace(e)) e.preventDefault()
}

/** Round button on the rear-view bezel: switch the webcam off or back on mid-round. */
function CameraToggle() {
  const status = useGameStore((s) => s.camera.status)
  const loading = status === 'loading'
  const on = CAMERA_ON.has(status)
  const label = loading ? 'Starting camera' : on ? 'Turn camera off' : 'Turn camera on'
  const tip = loading ? 'Starting camera… keyboard still works' : `${label} — keyboard still works`

  const onClick = (e) => {
    // Drop focus at once: a focused button would keep catching driving keys.
    e.currentTarget.blur()
    if (on) stopCamera()
    else startCamera()
  }

  return (
    <Tooltip side="top" content={tip}>
      <button
        type="button"
        className="cam-toggle"
        data-on={on || undefined}
        aria-label={label}
        disabled={loading}
        onClick={onClick}
        onKeyDown={swallowSpace}
        onKeyUp={swallowSpace}
      >
        {loading ? (
          <SpinnerIcon size={20} strokeWidth={2.4} />
        ) : on ? (
          <CameraIcon size={20} />
        ) : (
          <CameraOffIcon size={20} />
        )}
      </button>
    </Tooltip>
  )
}

export default function HUD() {
  return (
    <section className="hud" aria-label="Driving dashboard">
      {/* .hud__top wraps the whole cluster: score, time and speed all live
          inside it (e2e scripts read its innerText). */}
      <div className="hud__top">
        <div className="hud__corner hud__corner--left">
          <ScoreStat />
        </div>
        <div className="hud__corner hud__corner--right">
          <TimeStat />
        </div>
        <EventToast />
        <div className="hud__cluster">
          <ControlIndicator>
            <SpeedGauge />
          </ControlIndicator>
        </div>
      </div>

      <div className="hud__legend" aria-hidden="true">
        <span>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>or lean to change lanes</span>
        </span>
        <span>
          <Kbd>Space</Kbd>
          <span>or raise a hand to brake</span>
        </span>
      </div>

      <div className="hud__camera">
        <CameraToggle />
        <CameraPreview variant="compact" />
      </div>
    </section>
  )
}
