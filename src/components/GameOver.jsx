/**
 * Game-over screen: the "Driver Report" score card and its A4 PDF export.
 *
 * ── IN SIMPLE WORDS ──
 * When the clock runs out, the road freezes behind a dark veil and this
 * report slides up. It shows your grade inside a ring that fills as far as
 * your score got, the final score counting up, a strip showing *when* you
 * did each good or bad thing during the drive, four totals and the full
 * event list. "Download PDF" saves the same card as a one-page A4 file.
 *
 * ── BUSINESS RULES ──
 * - Score card with a grade at game over. Brief §2 "Civic Score Card".
 *   Grade letters, titles and thresholds come from GRADES / getGrade.
 * - Every logged violation and reward is listed with its time. Brief §1
 *   "logging traffic rule violations". Times come from event.t (store).
 * - Points per event type always come from POINTS (rules.js), never copied.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - The card's background is SOLID (no translucency). html-to-image paints
 *   only the card element, not the 3D road behind it, so a see-through
 *   glass card would export as a washed-out rectangle.
 * - SVG shapes (the grade ring) carry their colours as attributes, not CSS
 *   classes: the export does not apply class styles to SVG children, so a
 *   class-coloured ring prints black. That is why GRADE_HEX duplicates
 *   token colours.
 * - The timeline is plain HTML positioned by percentage, not SVG, for the
 *   same export reason and so it reflows at 320px.
 * - The score counts up with requestAnimationFrame. Before an export the
 *   count-up is forced to its end with flushSync, so the PDF can never
 *   capture a half-counted number.
 *
 * ── DO NOT ──
 * - Do not remove the `scorecard` / `gameover` classes: tests look for them.
 * - Do not move focus to a button on mount. A key still held from driving
 *   (Space) would "click" it the moment the screen appears.
 * - Do not give the card a translucent background or a CSS-only SVG colour.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useGameStore } from '../store/gameStore.js'
import { EVENT, GAME_DURATION, GRADES, POINTS, START_SCORE, getGrade } from '../game/rules.js'
import Tooltip from './Tooltip.jsx'
import { clamp, formatEventTime, formatPoints, toneOf } from './format.js'
import { DownloadIcon, HomeIcon, LogoMark, ReplayIcon, SpinnerIcon } from './icons.jsx'
import './GameOver.css'

const PDF_NAME = 'GestureKart-Score-Card.pdf'
const PDF_MARGIN_MM = 12
// Solid colour of the card (same as --card-bg in GameOver.css). Used as the
// export background so the rounded corners print in the card colour.
const CARD_BG = '#10173a'

const COUNT_UP_MS = 900
// The ring's full circle = this score. 200 leaves room above the top grade
// (A starts at 160) so an A ring is clearly fuller than a B, but not "done".
const RING_MAX = 200
const RING_R = 52
const RING_C = 2 * Math.PI * RING_R
const TICK_STEP = 15 // seconds between timeline labels

const STAT_ROWS = [
  { type: EVENT.RED_LIGHT, label: 'Red lights jumped' },
  { type: EVENT.CLEAN_STOP, label: 'Proper stops' },
  { type: EVENT.CLEAN_LANE_CHANGE, label: 'Clean lane changes' },
  { type: EVENT.COLLISION, label: 'Collisions' },
]

const GRADE_TONE = { A: 'green', B: 'cyan', C: 'amber', D: 'red' }
// Hex copies of the tokens (green / glow-cool / amber / red) for SVG attributes.
const GRADE_HEX = { A: '#2ee6a0', B: '#5ee7ff', C: '#ffc531', D: '#ff4d5e' }

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Counts from `from` to `target` over `duration` ms (ease-out). With reduced
 * motion it shows `target` straight away. `finish()` jumps to the end
 * synchronously (used before an export).
 */
function useCountUp(target, from, duration) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : from))
  const rafRef = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion() || from === target) {
      setValue(target)
      return undefined
    }
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - p) ** 3
      setValue(p === 1 ? target : Math.round(from + (target - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, from, duration])

  const finish = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    flushSync(() => setValue(target))
  }, [target])

  return [value, finish]
}

/**
 * Renders the score card element to a JPEG and places it on one A4 page.
 *
 * - The card has a SOLID background (CARD_BG + gradients): html-to-image
 *   paints only the element itself, not the 3D road behind it, so a
 *   translucent glass panel would export as a washed-out card.
 * - The first attempt embeds the web fonts. html-to-image has to read the
 *   Google Fonts stylesheet, which is cross-origin and can throw (CORS /
 *   SecurityError). We then retry once with skipFonts: the PDF falls back to
 *   system fonts, but the player still gets their card.
 * - The 'scorecard--exporting' class fixes the width at 640px, turns off
 *   animations/transitions and lifts the event log's max-height, so a long
 *   log prints in full instead of being cut at the scroll box. The caller
 *   must finish the score count-up before calling this.
 */
async function exportScoreCard(card) {
  const [{ toJpeg }, jspdf] = await Promise.all([import('html-to-image'), import('jspdf')])
  const JsPDF = jspdf.jsPDF ?? jspdf.default

  card.classList.add('scorecard--exporting')
  try {
    const width = card.offsetWidth
    const height = card.offsetHeight
    // JPEG, not PNG: a PNG of the card made a ~10 MB PDF; JPEG keeps it small
    // and the card has a solid background, so no transparency is lost.
    const options = { pixelRatio: 2, cacheBust: true, quality: 0.9, backgroundColor: CARD_BG }
    let dataUrl
    try {
      dataUrl = await toJpeg(card, options)
    } catch {
      dataUrl = await toJpeg(card, { ...options, skipFonts: true })
    }

    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const maxW = pageW - PDF_MARGIN_MM * 2
    const maxH = pageH - PDF_MARGIN_MM * 2

    // Fit the page width, keep the aspect ratio, shrink if taller than a page.
    let w = maxW
    let h = (w * height) / width
    if (h > maxH) {
      h = maxH
      w = (h * width) / height
    }
    pdf.addImage(dataUrl, 'JPEG', (pageW - w) / 2, PDF_MARGIN_MM, w, h)
    pdf.save(PDF_NAME)
  } finally {
    card.classList.remove('scorecard--exporting')
  }
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

// Stat icons. Stroke colour is an attribute (see header: SVG + export).
function StatIcon({ type, color }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
  }
  switch (type) {
    case EVENT.RED_LIGHT: // traffic light, red lamp lit
      return (
        <svg {...common}>
          <rect x="7" y="2.5" width="10" height="19" rx="5" />
          <circle cx="12" cy="7.5" r="2" fill={color} />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="16.5" r="1.6" />
        </svg>
      )
    case EVENT.CLEAN_STOP: // stop octagon with a check
      return (
        <svg {...common}>
          <path d="M8.3 2.5h7.4l5.3 5.3v7.4l-5.3 5.3H8.3L3 15.2V7.8z" />
          <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
        </svg>
      )
    case EVENT.CLEAN_LANE_CHANGE: // swerve between lanes
      return (
        <svg {...common}>
          <path d="M4 3v18M20 3v18" />
          <path d="M9 20c0-5 6-5 6-10V5" />
          <path d="M12.5 7.5L15 5l2.5 2.5" />
        </svg>
      )
    default: // collision burst
      return (
        <svg {...common}>
          <path d="M12 2.5l1.9 5.2 5.3-2-2.6 5 4.9 2.6-5.4 1.2.9 5.6-4.4-3.6-3.6 4.4-.6-5.6-5.4-.4 4.3-3.4L4.7 5.8l5.3 1.6z" />
        </svg>
      )
  }
}

function GradeRing({ grade, shownScore }) {
  const color = GRADE_HEX[grade]
  const frac = clamp(shownScore, 0, RING_MAX) / RING_MAX
  // Small marks where each grade starts (80, 120, 160 with the current rules).
  const marks = GRADES.filter((g) => Number.isFinite(g.min) && g.min > 0 && g.min < RING_MAX)

  return (
    <svg className="ring__svg" viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r={RING_R} fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - frac)}
        transform="rotate(-90 60 60)"
        opacity={frac > 0 ? 1 : 0}
      />
      {marks.map((g) => {
        const a = (g.min / RING_MAX) * 2 * Math.PI - Math.PI / 2
        const x1 = 60 + Math.cos(a) * (RING_R - 7)
        const y1 = 60 + Math.sin(a) * (RING_R - 7)
        const x2 = 60 + Math.cos(a) * (RING_R - 11)
        const y2 = 60 + Math.sin(a) * (RING_R - 11)
        return (
          <line key={g.grade} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
        )
      })}
    </svg>
  )
}

function Timeline({ events }) {
  const ticks = []
  for (let s = 0; s <= GAME_DURATION; s += TICK_STEP) ticks.push(s)
  if (ticks[ticks.length - 1] !== GAME_DURATION) ticks.push(GAME_DURATION)
  const pos = (t) => `${(clamp(t, 0, GAME_DURATION) / GAME_DURATION) * 100}%`

  return (
    <section className="timeline" aria-labelledby="timeline-title">
      <div className="scorecard__section-head">
        <h3 id="timeline-title" className="scorecard__h3">
          Drive timeline
        </h3>
        <span className="timeline__legend" aria-hidden="true">
          <span className="timeline__key" data-tone="good">Reward</span>
          <span className="timeline__key" data-tone="bad">Penalty</span>
        </span>
      </div>

      <div className="timeline__frame">
        <div className="timeline__track">
          <span className="timeline__road" aria-hidden="true" />
          {ticks.map((s) => (
            <span key={s} className="timeline__grid" style={{ left: pos(s) }} aria-hidden="true" />
          ))}
          <ol className="timeline__marks" aria-label="Events by time in the round">
            {events.map((e) => {
              const text = `${formatEventTime(e.t)} · ${e.label} · ${formatPoints(e.points)}`
              return (
                <li
                  key={e.id}
                  className="timeline__mark"
                  data-tone={toneOf(e.points)}
                  style={{ left: pos(e.t) }}
                  title={text}
                  aria-label={text}
                />
              )
            })}
          </ol>
        </div>
        <div className="timeline__ticks" aria-hidden="true">
          {ticks.map((s, i) => (
            <span
              key={s}
              className="timeline__tick"
              data-edge={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : undefined}
              style={{ left: pos(s) }}
            >
              {s}s
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Screen ────────────────────────────────────────────────────────────── */

export default function GameOver() {
  const score = useGameStore((s) => s.score)
  const events = useGameStore((s) => s.events)
  const startGame = useGameStore((s) => s.startGame)
  const goToStart = useGameStore((s) => s.goToStart)

  const cardRef = useRef(null)
  const headingRef = useRef(null)
  const [finishedAt] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shownScore, finishCountUp] = useCountUp(score, START_SCORE, COUNT_UP_MS)

  // Move focus to the heading (not a button): a key still held from driving,
  // like Space, must not "click" Play again the moment the screen appears.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const { grade, title } = getGrade(score)
  const counts = events.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {})
  const net = score - START_SCORE
  // Lowest grade threshold above the score = the next grade to aim for.
  const next = [...GRADES].reverse().find((g) => g.min > score)
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(finishedAt)

  const download = async () => {
    if (!cardRef.current || busy) return
    finishCountUp() // the PDF must show the final score, not a mid-count value
    setBusy(true)
    setError('')
    try {
      await exportScoreCard(cardRef.current)
    } catch (err) {
      console.error('Score card export failed', err)
      setError('Could not create the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen gameover" aria-labelledby="gameover-title">
      <div className="gameover__inner">
        <header className="gameover__head">
          <span className="eyebrow gameover__eyebrow">Round complete</span>
          <h1 id="gameover-title" className="gameover__title" ref={headingRef} tabIndex={-1}>
            Time’s up!
          </h1>
        </header>

        <article className="scorecard" ref={cardRef} aria-label="Civic Driving Score Card">
          <div className="scorecard__body">
            <header className="scorecard__head">
              <LogoMark size={44} />
              <div className="scorecard__heading">
                <span className="eyebrow">GestureKart · Driver report</span>
                <h2 className="scorecard__title">Civic Driving Score Card</h2>
              </div>
              <time className="scorecard__date" dateTime={finishedAt.toISOString()}>
                {dateLabel}
              </time>
            </header>

            <div className="scorecard__hero" data-grade={GRADE_TONE[grade]}>
              <div className="ring">
                <span className="ring__glow" aria-hidden="true" />
                <GradeRing grade={grade} shownScore={shownScore} />
                <span className="ring__letter">
                  <span className="sr-only">Grade </span>
                  {grade}
                </span>
              </div>

              <div className="scorecard__score">
                <span className="eyebrow">Final score</span>
                <span className="scorecard__score-value">
                  {/* true minus sign, same width as the digits */}
                  {shownScore < 0 ? `−${Math.abs(shownScore)}` : shownScore}
                </span>
                <span className="scorecard__grade-title">{title}</span>
                <span className="scorecard__meta">
                  <span className="scorecard__net" data-tone={toneOf(net)}>
                    {net === 0 ? '±0' : formatPoints(net)} from {START_SCORE}
                  </span>
                  <span className="scorecard__next">
                    {next ? `${next.min - score} pts to grade ${next.grade}` : 'Top grade reached'}
                  </span>
                </span>
              </div>
            </div>

            <dl className="scorecard__stats">
              {STAT_ROWS.map(({ type, label }) => {
                const tone = toneOf(POINTS[type])
                const n = counts[type] ?? 0
                return (
                  <div key={type} className="stat-tile" data-tone={tone} data-zero={n === 0 || undefined}>
                    <dt>
                      <span className="stat-tile__icon">
                        <StatIcon type={type} color={tone === 'good' ? GRADE_HEX.A : GRADE_HEX.D} />
                      </span>
                      <span className="stat-tile__label">{label}</span>
                    </dt>
                    <dd>
                      <span className="stat-tile__value">{n}</span>
                      <span className="stat-tile__each">{formatPoints(POINTS[type])} each</span>
                    </dd>
                  </div>
                )
              })}
            </dl>

            <Timeline events={events} />

            <section className="scorecard__log" aria-labelledby="log-title">
              <div className="scorecard__section-head">
                <h3 id="log-title" className="scorecard__h3">
                  Event log
                </h3>
                <span className="scorecard__count">
                  {events.length} {events.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              {events.length === 0 ? (
                <p className="log__empty">Perfect run — no violations!</p>
              ) : (
                <ol
                  className="log"
                  tabIndex={0}
                  aria-label="Events in this round"
                  data-long={events.length > 10 || undefined}
                >
                  {events.map((e) => (
                    <li key={e.id} className="log__row" data-tone={toneOf(e.points)}>
                      <span className="log__time">{formatEventTime(e.t)}</span>
                      <span className="log__label">{e.label}</span>
                      <span className="log__points">{formatPoints(e.points)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <footer className="scorecard__foot">GestureKart · Traffic rule training</footer>
          </div>
        </article>

        <div className="gameover__actions">
          <Tooltip content="Save this score card as an A4 PDF.">
            <button
              type="button"
              className="btn btn--primary"
              onClick={download}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? <SpinnerIcon size={18} /> : <DownloadIcon size={18} />}
              {busy ? 'Preparing PDF…' : 'Download PDF'}
            </button>
          </Tooltip>
          <Tooltip content="Start a new round straight away.">
            <button type="button" className="btn btn--ghost" onClick={startGame}>
              <ReplayIcon size={18} />
              Play again
            </button>
          </Tooltip>
          <Tooltip content="Back to the start screen and camera setup.">
            <button type="button" className="btn btn--ghost" onClick={goToStart}>
              <HomeIcon size={18} />
              Home
            </button>
          </Tooltip>
        </div>

        {error && (
          <p className="gameover__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
