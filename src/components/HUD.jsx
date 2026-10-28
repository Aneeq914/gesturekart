import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { START_SCORE } from '../game/rules.js'
import CameraPreview from './CameraPreview.jsx'
import Tooltip from './Tooltip.jsx'
import Kbd from './Kbd.jsx'
import { formatClock, formatPoints, toneOf } from './format.js'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  CruiseIcon,
  HandIcon,
  KeyboardIcon,
} from './icons.jsx'
import './HUD.css'

const LOW_TIME = 10 // seconds; the clock turns red at or below this
const TOAST_MS = 1600
const TOAST_EXIT_MS = 260 // matches the hud-toast-out animation in HUD.css

// Each piece below subscribes to ONE store field, so a score change does not
// re-render the clock, and a gesture change does not re-render the score.

function ScoreStat() {
  const score = useGameStore((s) => s.score)
  return (
    <Tooltip
      side="bottom"
      content={`You started at ${START_SCORE}. Stop at red lights and dodge blocking cars to earn points. Jumping reds and crashing cost points.`}
    >
      <div className="stat stat--score" tabIndex={0}>
        <span className="stat__label">Score</span>
        {/* key replays the small "pop" whenever the score changes */}
        <span key={score} className="stat__value">
          {score}
        </span>
      </div>
    </Tooltip>
  )
}

function TimeStat() {
  const timeLeft = useGameStore((s) => s.timeLeft)
  const low = timeLeft <= LOW_TIME
  return (
    <div className="stat stat--time" data-low={low || undefined}>
      <span className="stat__label">Time</span>
      <span className="stat__value">
        <span className="sr-only">{timeLeft} seconds left, </span>
        <span aria-hidden="true">{formatClock(timeLeft)}</span>
      </span>
    </div>
  )
}

function SpeedStat() {
  const speed = useGameStore((s) => s.speed)
  return (
    <div className="stat stat--speed">
      <span className="stat__label">Speed</span>
      <span className="stat__value">
        {Math.round(speed)}
        <span className="stat__unit">km/h</span>
      </span>
    </div>
  )
}

const CONTROL = {
  left: { label: 'Lane left', Icon: ArrowLeftIcon, tone: 'move' },
  right: { label: 'Lane right', Icon: ArrowRightIcon, tone: 'move' },
  stop: { label: 'Braking', Icon: HandIcon, tone: 'stop' },
  none: { label: 'Cruising', Icon: CruiseIcon, tone: 'idle' },
}

const SOURCE_TIP = {
  camera: 'Driving with your webcam: lean to switch lanes, raise a hand to brake.',
  keyboard: 'Driving with the keyboard: ← → or A / D switch lanes, Space / ↓ / S brakes.',
}

function ControlIndicator() {
  const action = useGameStore((s) => s.input.action)
  const source = useGameStore((s) => s.input.source)
  const { label, Icon, tone } = CONTROL[action] ?? CONTROL.none
  const isKeyboard = source === 'keyboard'

  return (
    <Tooltip side="top" content={SOURCE_TIP[isKeyboard ? 'keyboard' : 'camera']}>
      <div
        className="control"
        data-tone={tone}
        tabIndex={0}
      >
        <span className="control__icon">
          <Icon size={22} strokeWidth={2.4} />
        </span>
        <span className="control__text">
          <span className="control__label">{label}</span>
          <span className="control__source">
            {isKeyboard ? <KeyboardIcon size={14} /> : <CameraIcon size={14} />}
            {isKeyboard ? 'Keyboard' : 'Camera'}
          </span>
        </span>
      </div>
    </Tooltip>
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
      <span className="toast__points">{formatPoints(event.points)}</span>
      <span className="toast__label">{event.label}</span>
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

export default function HUD() {
  return (
    <section className="hud" aria-label="Driving dashboard">
      <div className="hud__top">
        <div className="hud__stats">
          <ScoreStat />
          <TimeStat />
          <SpeedStat />
        </div>
        <EventToast />
      </div>

      <div className="hud__control">
        <ControlIndicator />
      </div>

      <div className="hud__legend" aria-hidden="true">
        <span>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd> or lean to change lanes
        </span>
        <span className="hud__legend-sep" />
        <span>
          <Kbd>Space</Kbd> or raise a hand to brake
        </span>
      </div>

      <div className="hud__camera">
        <CameraPreview variant="compact" />
      </div>
    </section>
  )
}
