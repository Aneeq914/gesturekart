import { useGameStore } from '../store/gameStore.js'
import { EVENT, EVENT_LABEL, GAME_DURATION, POINTS, START_SCORE } from '../game/rules.js'
import { startCamera, stopCamera } from '../gesture/gestureEngine.js'
import CameraPreview from './CameraPreview.jsx'
import Tooltip from './Tooltip.jsx'
import Kbd from './Kbd.jsx'
import { formatPoints, toneOf } from './format.js'
import {
  ArrowRightIcon,
  CameraIcon,
  InfoIcon,
  KeyboardFigure,
  LeanFigure,
  LogoMark,
  RaiseHandFigure,
  SpinnerIcon,
} from './icons.jsx'
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

  return (
    <section className="panel cam" aria-labelledby="cam-title">
      <div className="cam__head">
        <h2 id="cam-title" className="start__h2">
          Camera
        </h2>
        <span className="chip">Optional</span>
      </div>

      <div className="cam__preview">
        <CameraPreview variant="large" />
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
        <header className="start__brand">
          <div className="start__brand-row">
            <LogoMark size={56} />
            <span className="chip">Traffic rule trainer</span>
          </div>
          <h1 id="start-title" className="start__title">
            GestureKart
          </h1>
          <p className="start__tagline">Learn traffic rules by driving with your body.</p>
        </header>

        <section className="panel start__how" aria-labelledby="how-title">
          <h2 id="how-title" className="start__h2">
            How to play
          </h2>
          <ol className="how">
            <li className="how__item">
              <span className="how__icon">
                <LeanFigure />
              </span>
              <div>
                <h3 className="how__title">Lean left / right</h3>
                <p className="how__text">Tilt your shoulders to switch lanes.</p>
              </div>
            </li>
            <li className="how__item">
              <span className="how__icon how__icon--stop">
                <RaiseHandFigure />
              </span>
              <div>
                <h3 className="how__title">Raise a hand above your head</h3>
                <p className="how__text">Brake. Hold it at red lights until they turn green.</p>
              </div>
            </li>
            <li className="how__item">
              <span className="how__icon how__icon--keys">
                <KeyboardFigure />
              </span>
              <div>
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

        <div className="start__side">
          <CameraPanel />
          <Tooltip
            className="tt--block"
            content="The camera is optional. Arrow keys or A / D steer, and Space brakes."
          >
            <button type="button" className="btn btn--primary btn--xl btn--block" onClick={startGame}>
              Start driving
              <ArrowRightIcon size={22} strokeWidth={2.4} />
            </button>
          </Tooltip>
        </div>

        <section className="panel start__scoring" aria-labelledby="scoring-title">
          <h2 id="scoring-title" className="start__h2">
            Scoring
          </h2>
          <p className="start__rules-note">
            You start at <strong>{START_SCORE}</strong> points. A round lasts{' '}
            <strong>{GAME_DURATION} s</strong>.
          </p>
          <ul className="rules">
            {SCORING.map(({ type, tip }) => (
              <li key={type}>
                <Tooltip className="tt--block" content={tip}>
                  <div className="rule" data-tone={toneOf(POINTS[type])} tabIndex={0}>
                    <span className="rule__dot" aria-hidden="true" />
                    <span className="rule__label">{EVENT_LABEL[type]}</span>
                    <InfoIcon size={16} className="rule__info" />
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
