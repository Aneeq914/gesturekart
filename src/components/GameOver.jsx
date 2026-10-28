import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { EVENT, POINTS, START_SCORE, getGrade } from '../game/rules.js'
import Tooltip from './Tooltip.jsx'
import { formatPoints, toneOf } from './format.js'
import { DownloadIcon, HomeIcon, LogoMark, ReplayIcon, SpinnerIcon } from './icons.jsx'
import './GameOver.css'

const PDF_NAME = 'GestureKart-Score-Card.pdf'
const PDF_MARGIN_MM = 12

const STAT_ROWS = [
  { type: EVENT.RED_LIGHT, label: 'Red lights jumped' },
  { type: EVENT.CLEAN_STOP, label: 'Proper stops' },
  { type: EVENT.CLEAN_LANE_CHANGE, label: 'Clean lane changes' },
  { type: EVENT.COLLISION, label: 'Collisions' },
]

const GRADE_TONE = { A: 'green', B: 'blue', C: 'amber', D: 'red' }

/**
 * Renders the score card element to a JPEG and places it on one A4 page.
 *
 * - The card has a SOLID background (--panel-solid): html-to-image paints
 *   only the element itself, not the 3D road behind it, so a translucent
 *   glass panel would export as a washed-out card.
 * - The first attempt embeds the web fonts. html-to-image has to read the
 *   Google Fonts stylesheet, which is cross-origin and can throw (CORS /
 *   SecurityError). We then retry once with skipFonts: the PDF falls back to
 *   system fonts, but the player still gets their card.
 * - The 'scorecard--exporting' class lifts the event log's max-height so a
 *   long log prints in full instead of being cut at the scroll box.
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
    const options = { pixelRatio: 2, cacheBust: true, quality: 0.9, backgroundColor: '#141c3a' }
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

  // Move focus to the heading (not a button): a key still held from driving,
  // like Space, must not "click" Play again the moment the screen appears.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const { grade, title } = getGrade(score)
  const counts = events.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {})
  const net = score - START_SCORE
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(finishedAt)

  const download = async () => {
    if (!cardRef.current || busy) return
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
          <span className="eyebrow">Round complete</span>
          <h1 id="gameover-title" className="gameover__title" ref={headingRef} tabIndex={-1}>
            Time’s up!
          </h1>
        </header>

        <article className="scorecard" ref={cardRef} aria-label="Civic Driving Score Card">
          <header className="scorecard__head">
            <LogoMark size={44} />
            <div className="scorecard__heading">
              <span className="eyebrow">GestureKart</span>
              <h2 className="scorecard__title">Civic Driving Score Card</h2>
            </div>
            <time className="scorecard__date" dateTime={finishedAt.toISOString()}>
              {dateLabel}
            </time>
          </header>

          <div className="scorecard__hero">
            <div className="scorecard__score">
              <span className="eyebrow">Final score</span>
              <span className="scorecard__score-value">{score}</span>
              <span className="scorecard__net" data-tone={toneOf(net)}>
                {formatPoints(net)} from {START_SCORE}
              </span>
            </div>
            <div className="scorecard__grade" data-grade={GRADE_TONE[grade]}>
              <span className="scorecard__badge">
                <span className="sr-only">Grade </span>
                {grade}
              </span>
              <span className="scorecard__grade-title">{title}</span>
            </div>
          </div>

          <dl className="scorecard__stats">
            {STAT_ROWS.map(({ type, label }) => (
              <div key={type} className="scorecard__stat" data-tone={toneOf(POINTS[type])}>
                <dt>{label}</dt>
                <dd>
                  <span className="scorecard__stat-value">{counts[type] ?? 0}</span>
                  <span className="scorecard__stat-each">{formatPoints(POINTS[type])} each</span>
                </dd>
              </div>
            ))}
          </dl>

          <section className="scorecard__log" aria-labelledby="log-title">
            <div className="scorecard__log-head">
              <h3 id="log-title" className="scorecard__h3">
                Event log
              </h3>
              <span className="scorecard__log-count">
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </span>
            </div>
            {events.length === 0 ? (
              <p className="log__empty">Perfect run — no violations!</p>
            ) : (
              <ol className="log" tabIndex={0} aria-label="Events in this round">
                {events.map((e) => (
                  <li key={e.id} className="log__row" data-tone={toneOf(e.points)}>
                    <span className="log__time">{e.t.toFixed(1)} s</span>
                    <span className="log__label">{e.label}</span>
                    <span className="log__points">{formatPoints(e.points)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <footer className="scorecard__foot">GestureKart · Traffic rule training</footer>
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
