/**
 * Shared game state: the one place that knows the score, the clock, the
 * current gesture and which screen is showing.
 *
 * ── IN SIMPLE WORDS ──
 * Think of this as the scoreboard in a stadium. The webcam code writes what
 * your body is doing, the 3D road writes what happened (you stopped, you hit
 * a car), and every screen reads from it. The different parts never talk to
 * each other directly. They all go through this board.
 *
 * ── BUSINESS RULES ──
 * - Each round starts at START_SCORE and lasts GAME_DURATION seconds (rules.js).
 * - Every scoring event is logged with its time, so the score card can list
 *   every violation. Brief §1: "logging traffic rule violations".
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - Zustand lets the 3D loop read the latest input with getState() at
 *   60 fps without re-rendering React. If you put the input in React state
 *   instead, every gesture change re-renders the whole scene and the game
 *   stutters.
 * - setInput, setSpeed and setTimeLeft skip the update when the value is
 *   unchanged. Without that check the HUD re-renders on every frame.
 *
 * ── DO NOT ──
 * - Do not change `score` directly. Use addEvent(type) so the log and the
 *   score can never drift apart.
 * - Do not call addEvent unless phase === 'playing'. It already ignores
 *   those calls, so events from a finished round can't leak into the
 *   score card.
 */
import { create } from 'zustand'
import { EVENT_LABEL, GAME_DURATION, POINTS, START_SCORE } from '../game/rules.js'

let nextEventId = 1

const freshRound = () => ({
  score: START_SCORE,
  events: [], // { id, type, label, points, t } where t = seconds since round start
  timeLeft: GAME_DURATION,
  speed: 0, // km/h, for the HUD only
  lastEvent: null, // most recent event, used for the on-screen toast
})

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'playing' | 'over'
  roundId: 0, // increments every new round, so the 3D world can reset itself
  ...freshRound(),

  // Current control input, written by the webcam or the keyboard.
  input: { action: 'none', source: 'camera' }, // action: 'left' | 'right' | 'stop' | 'none'

  // Webcam / pose-model status, shown on the start screen and in the HUD.
  camera: { status: 'idle', message: '' }, // status: 'idle' | 'loading' | 'ready' | 'no-body' | 'denied' | 'error'

  startGame: () =>
    set((s) => ({ ...freshRound(), phase: 'playing', roundId: s.roundId + 1 })),

  endGame: () => set({ phase: 'over' }),

  goToStart: () => set({ ...freshRound(), phase: 'start' }),

  addEvent: (type) => {
    const s = get()
    if (s.phase !== 'playing') return
    const event = {
      id: nextEventId++,
      type,
      label: EVENT_LABEL[type],
      points: POINTS[type],
      t: Math.round((GAME_DURATION - s.timeLeft) * 10) / 10,
    }
    set({ score: s.score + event.points, events: [...s.events, event], lastEvent: event })
  },

  setTimeLeft: (timeLeft) => {
    const rounded = Math.max(0, Math.ceil(timeLeft))
    if (rounded !== get().timeLeft) set({ timeLeft: rounded })
  },

  setSpeed: (speed) => {
    if (speed !== get().speed) set({ speed })
  },

  setInput: (action, source) => {
    const cur = get().input
    if (cur.action !== action || cur.source !== source) set({ input: { action, source } })
  },

  setCameraStatus: (status, message = '') => {
    const cur = get().camera
    if (cur.status !== status || cur.message !== message) set({ camera: { status, message } })
  },
}))
