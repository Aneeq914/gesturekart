/**
 * Keyboard fallback controls, merged with the webcam gestures into one input.
 *
 * ── IN SIMPLE WORDS ──
 * If the webcam isn't on, or the player just prefers keys, the arrow keys
 * (or A / D / S, or Space) drive the car instead. While a key is held, the
 * keyboard is in charge; the moment you let go, the camera takes over again.
 *
 * ── BUSINESS RULES ──
 * - Hackathon brief §2 Camera Controls: keyboard is the fallback control.
 * - ArrowLeft / A = left, ArrowRight / D = right, Space / ArrowDown / S = stop
 *   (gesture module spec).
 * - A held key wins over the camera. The most recently pressed key wins if
 *   several are held.
 * - On release the input reverts to the latest camera action, or 'none'
 *   when the camera isn't running.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - setKeyboardActive() tells the gesture engine to stop writing while a
 *   key is held. Without it the camera overwrites the key every frame and
 *   the keyboard appears dead whenever the camera is on.
 * - preventDefault runs on keydown AND keyup during play. Space scrolls the
 *   page on keydown and, in some browsers, activates a focused button on
 *   keyup; blocking both stops a "stop" press from also clicking whatever
 *   button still has focus (e.g. the Start button).
 * - Window blur releases every key. Otherwise alt-tabbing while holding a
 *   key leaves it "stuck" (the keyup goes to another window) and the car
 *   steers forever.
 * - Matching on e.key (the letter typed) instead of e.code keeps A/D/S on
 *   the printed letters for non-QWERTY layouts.
 *
 * ── DO NOT ──
 * - Do not start the camera here. The start screen's "Enable camera" button
 *   calls startCamera(), so the permission prompt only appears after the
 *   player opts in, and keyboard-only players are never asked.
 * - Do not call this hook more than once (App.jsx owns it). Two copies would
 *   each track held keys and fight over the input.
 */
import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { getLatestPose, isCameraRunning, setKeyboardActive } from './gestureEngine.js'

const KEY_ACTION = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ' ': 'stop',
  Spacebar: 'stop',
  ArrowDown: 'stop',
  s: 'stop',
  S: 'stop',
}

function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useControls() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const held = [] // keys currently down, most recent last

    const apply = () => {
      const { setInput } = useGameStore.getState()
      if (held.length > 0) {
        setKeyboardActive(true)
        setInput(KEY_ACTION[held[held.length - 1]], 'keyboard')
        return
      }
      setKeyboardActive(false)
      if (isCameraRunning()) setInput(getLatestPose().action, 'camera')
      else setInput('none', 'keyboard')
    }

    const onKeyDown = (e) => {
      const action = KEY_ACTION[e.key]
      if (!action || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (useGameStore.getState().phase === 'playing') e.preventDefault()
      if (held.includes(e.key)) return // auto-repeat
      held.push(e.key)
      apply()
    }

    const onKeyUp = (e) => {
      const action = KEY_ACTION[e.key]
      if (!action) return
      if (useGameStore.getState().phase === 'playing' && !isTypingTarget(e.target)) e.preventDefault()
      // Shift changes e.key between 'a' and 'A', so release both spellings.
      const lower = e.key.toLowerCase()
      for (let i = held.length - 1; i >= 0; i--) {
        if (held[i].toLowerCase() === lower) held.splice(i, 1)
      }
      apply()
    }

    const onBlur = () => {
      if (held.length === 0) return
      held.length = 0
      apply()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      if (held.length > 0) {
        held.length = 0
        apply()
      }
    }
  }, [])
}
