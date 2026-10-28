/**
 * Start screen: the first thing a player sees, floating over the night road.
 *
 * ── IN SIMPLE WORDS ──
 * The "lobby" of the game. It shows the name, how to drive (lean, raise a
 * hand, or use the keys), lets you switch the webcam on or off and see
 * yourself, explains how points work, and has the big "Start driving" button.
 * It looks like a car's dashboard screen at night: dark glass panels with the
 * 3D road still glowing behind them.
 *
 * ── BUSINESS RULES ──
 * - The camera is optional; the keyboard always works (brief §2 accessibility
 *   fallback). The status line says so when the camera is off.
 * - Every number shown (points, round length, start score) comes from
 *   game/rules.js, so this screen can never disagree with the score card.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - The camera button is a toggle whose label names the action a click will
 *   take. It is disabled while loading: a second click would call
 *   stopCamera() on a start that is still in flight and leave the engine
 *   half-started.
 * - The CTA sits in the hero (first in the DOM after the title) so on a phone
 *   it is on screen without scrolling.
 * - The traffic light and the stick-figure scenes are decorative
 *   (aria-hidden); the headings and text next to them carry the meaning.
 *   Their animations are pure CSS and switch off under reduced motion.
 *
 * ── DO NOT ──
 * - Do not hard-code points, round length or start score: import them.
 * - Do not remove "Start driving" from the CTA text (tests and docs use it).
 * - Do not put a Tooltip inside an overflow: hidden box (the bubble clips).
 */
import { useGameStore } from '../store/gameStore.js'
import { EVENT, EVENT_LABEL, GAME_DURATION, POINTS, START_SCORE } from '../game/rules.js'
import { startCamera, stopCamera } from '../gesture/gestureEngine.js'
import CameraPreview from './CameraPreview.jsx'
import Tooltip from './Tooltip.jsx'
import Kbd from './Kbd.jsx'
import { formatPoints, toneOf } from './format.js'
import { ArrowRightIcon, CameraIcon, InfoIcon, LogoMark, SpinnerIcon } from './icons.jsx'
import './StartScreen.css'

// Order shown in the scoring list, with what triggers each event.
const SCORING = [
  {
    type: EVENT.CLEAN_STOP,
    tip: 'Raise a hand (or hold Space) and come to a full stop before the stop line while the light is red. Keep braking until it turns green: rolling over the line on red counts as jumping it.',
  },
  {
    type: EVENT.CLEAN_LANE_CHANGE,
    tip: 'A car is blocking your lane. Switch lanes and get past it without touching it.',
  },
  {
    type: EVENT.RED_LIGHT,
    tip: 'Your car crosses the stop line while the light is red.',
  },
  {
    type: EVENT.COLLISION,
    tip: 'You drive into a car that is blocking your lane.',
  },
]

// The camera button is an ON/OFF toggle: its label always names the action a
// click will take, so "on" states read "Turn camera off".
const CAMERA_BUTTON = {
  idle: 'Turn camera on',
  loading: 'Starting camera…',
  ready: 'Turn camera off',
  'no-body': 'Turn camera off',
  denied: 'Try again',
  error: 'Try again',
}

const CAMERA_FALLBACK_MESSAGE = {
  idle: 'Camera is off. Turn it on to drive with gestures, or use the keyboard.',
  loading: 'Loading the camera and pose model…',
  ready: 'Camera ready. We can see you.',
  'no-body': 'Step back so your head and shoulders are in view.',
  denied: 'Camera access was blocked. Allow it in your browser, or use the keyboard.',
  error: 'The camera could not start. Use the keyboard instead.',
}

/* ── Decorative illustrations (aria-hidden; CSS animates them) ──────────── */

/** A CSS traffic light that cycles red → amber → green (static red when
 *  the user prefers reduced motion). */
function TrafficSignal() {
  return (
    <div className="signal" aria-hidden="true">
      <div className="signal__housing">
        <span className="signal__lamp signal__lamp--red" />
        <span className="signal__lamp signal__lamp--amber" />
        <span className="signal__lamp signal__lamp--green" />
      </div>
      <span className="signal__pole" />
    </div>
  )
}

/** Shared SVG stage for the "how to play" scenes (120×80 units). */
function Scene({ className, children }) {
  return (
    <svg
      className={`scene ${className}`}
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path className="scene__ground" d="M14 72h92" />
      {children}
    </svg>
  )
}

/** Stick figure swaying its shoulders left and right, with lane chevrons. */
const LeanScene = () => (
  <Scene className="scene--lean">
    <path className="scene__chev scene__chev--l" d="M24 30l-8 8 8 8" />
    <path className="scene__chev scene__chev--r" d="M96 30l8 8-8 8" />
    <path d="M60 50l-8 21M60 50l8 21" />
    <g className="scene__torso">
      <circle cx="60" cy="16" r="7" />
      <path d="M60 24v26" />
      <path d="M45 33h30" />
    </g>
  </Scene>
)

/** Stick figure raising one hand above the head; a brake light answers. */
const RaiseScene = () => (
  <Scene className="scene--raise">
    <circle cx="56" cy="18" r="7" />
    <path d="M56 26v24" />
    <path d="M56 32l-9 14" />
    <path d="M56 50l-8 21M56 50l8 21" />
    <g className="scene__arm">
      <path d="M57 31l6-19" />
      <circle className="scene__palm" cx="64" cy="9" r="2.6" />
    </g>
    <rect className="scene__brake" x="86" y="30" width="18" height="18" rx="5" />
  </Scene>
)

/** Three keycaps pressing in turn: left, right, then Space. */
const KeysScene = () => (
  <div className="keys-demo" aria-hidden="true">
    <span className="keys-demo__key keys-demo__key--l">←</span>
    <span className="keys-demo__key keys-demo__key--r">→</span>
    <span className="keys-demo__key keys-demo__key--space">Space</span>
  </div>
)

/* ── Camera panel (infotainment screen) ─────────────────────────────────── */

function CameraPanel() {
  const camera = useGameStore((s) => s.camera)
  const { status } = camera
  const busy = status === 'loading'
  const on = status === 'ready' || status === 'no-body'

  const toggle = () => {
    // While the webcam runs (ready / no-body) a click switches it off. Off,
    // denied and error all (re)try starting it. Loading is disabled below, so
    // a double click can't stop a start that's still in flight.
    if (on) {
      stopCamera()
      return
    }
    // The engine reports progress and failures through camera.status, so a
    // rejection here only needs swallowing (no unhandled-rejection noise).
    try {
      startCamera()?.catch?.(() => {})
    } catch {
      // Same: the status line already shows the error.
    }
  }

  // Bezel LED: decorative echo of the status line (which screen readers get).
  const led = on ? 'live' : busy ? 'busy' : 'off'

  return (
    <section className="panel cam" aria-labelledby="cam-title">
      <div className="cam__head">
        <h2 id="cam-title" className="start__h2">
          Camera
        </h2>
        <div className="cam__badges">
          <span className="cam__led" data-led={led} aria-hidden="true">
            <span className="cam__led-dot" />
            {on ? 'LIVE' : busy ? 'INIT' : 'OFF'}
          </span>
          <span className="chip">Optional</span>
        </div>
      </div>

      <div className="cam__bezel">
        <div className="cam__preview">
          <CameraPreview variant="large" />
        </div>
      </div>

      <Tooltip
        className="tt--block"
        content="Turn the webcam off any time — you can still drive with the keyboard."
      >
        <button
          type="button"
          className="btn btn--ghost btn--block cam__toggle"
          onClick={toggle}
          disabled={busy}
          data-on={on || undefined}
          aria-busy={busy || undefined}
        >
          {busy ? (
            <SpinnerIcon size={18} />
          ) : on ? (
            <span className="cam__live" aria-hidden="true" />
          ) : (
            <CameraIcon size={18} />
          )}
          {CAMERA_BUTTON[status] ?? CAMERA_BUTTON.idle}
        </button>
      </Tooltip>

      <p className="cam__status" data-status={status} role="status" aria-live="polite">
        <span className="cam__dot" aria-hidden="true" />
        <span>{camera.message || CAMERA_FALLBACK_MESSAGE[status]}</span>
      </p>

      {status === 'ready' && (
        <p className="cam__hint">
          <strong>Try it:</strong> lean left and right, then raise a hand. The chip on the preview
          shows what we detect.
        </p>
      )}
    </section>
  )
}

export default function StartScreen() {
  const startGame = useGameStore((s) => s.startGame)

  return (
    <main className="screen start" aria-labelledby="start-title">
      <div className="start__inner">
        <header className="start__hero">
          <div className="start__brand-row">
            <LogoMark size={44} />
            <span className="chip start__kicker">Traffic rule trainer</span>
          </div>

          <TrafficSignal />

          <h1 id="start-title" className="start__title">
            Gesture<span className="start__title-accent">Kart</span>
          </h1>
          <p className="start__tagline">Learn traffic rules by driving with your body.</p>

          <div className="start__cta">
            <Tooltip
              className="tt--block"
              content="The camera is optional. Arrow keys or A / D steer, and Space brakes."
            >
              <button type="button" className="btn btn--primary btn--xl btn--block" onClick={startGame}>
                Start driving
                <ArrowRightIcon size={22} strokeWidth={2.4} />
              </button>
            </Tooltip>
            <p className="start__meta">
              <span>
                Round <b>{GAME_DURATION} s</b>
              </span>
              <span className="start__meta-sep" aria-hidden="true" />
              <span>
                Start <b>{START_SCORE} pts</b>
              </span>
            </p>
          </div>
        </header>

        <CameraPanel />

        <section className="panel start__how" aria-labelledby="how-title">
          <h2 id="how-title" className="start__h2">
            How to play
          </h2>
          <ol className="how">
            <li className="how__card how__card--lean">
              <div className="how__art">
                <LeanScene />
              </div>
              <div className="how__body">
                <span className="how__step" aria-hidden="true">
                  01
                </span>
                <h3 className="how__title">Lean left / right</h3>
                <p className="how__text">Tilt your shoulders to switch lanes.</p>
              </div>
            </li>
            <li className="how__card how__card--stop">
              <div className="how__art">
                <RaiseScene />
              </div>
              <div className="how__body">
                <span className="how__step" aria-hidden="true">
                  02
                </span>
                <h3 className="how__title">Raise a hand above your head</h3>
                <p className="how__text">Brake. Hold it at red lights until they turn green.</p>
              </div>
            </li>
            <li className="how__card how__card--keys">
              <div className="how__art">
                <KeysScene />
              </div>
              <div className="how__body">
                <span className="how__step" aria-hidden="true">
                  03
                </span>
                <h3 className="how__title">No webcam?</h3>
                <p className="how__text how__keys">
                  <span>
                    <Kbd label="Left arrow">←</Kbd> <Kbd label="Right arrow">→</Kbd> or <Kbd>A</Kbd>{' '}
                    <Kbd>D</Kbd> change lanes
                  </span>
                  <span>
                    <Kbd>Space</Kbd> <Kbd label="Down arrow">↓</Kbd> or <Kbd>S</Kbd> brake
                  </span>
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="panel start__scoring" aria-labelledby="scoring-title">
          <div className="start__scoring-head">
            <h2 id="scoring-title" className="start__h2">
              Scoring
            </h2>
            <p className="start__rules-note">
              You start at <strong>{START_SCORE}</strong> points. A round lasts{' '}
              <strong>{GAME_DURATION} s</strong>.
            </p>
          </div>
          <ul className="rules">
            {SCORING.map(({ type, tip }) => (
              <li key={type}>
                <Tooltip className="tt--block" content={tip}>
                  <div className="rule" data-tone={toneOf(POINTS[type])} tabIndex={0}>
                    <span className="rule__label">
                      <span className="rule__dot" aria-hidden="true" />
                      {EVENT_LABEL[type]}
                      <InfoIcon size={15} className="rule__info" />
                    </span>
                    <span className="rule__points">{formatPoints(POINTS[type])}</span>
                  </div>
                </Tooltip>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
