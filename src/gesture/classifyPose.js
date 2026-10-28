/**
 * Turns one frame of MediaPipe Pose landmarks into a driving action:
 * 'left' | 'right' | 'stop' | 'none'.
 *
 * ── IN SIMPLE WORDS ──
 * The webcam model gives us 33 dots on the player's body every frame. This
 * file looks at just a few of them (nose, shoulders, wrists) and answers
 * one question: "what is the player asking the car to do right now?"
 * - Hand up above your head means STOP (like a traffic cop).
 * - Tilt your shoulders, like leaning into a turn, to steer left or right.
 * - Anything else means "carry on" (none).
 * It's like a referee who only blows the whistle when the move is clear
 * and held, not on every twitch.
 *
 * ── BUSINESS RULES ──
 * - Hackathon brief §2 Camera Controls: lean left = move left, lean right =
 *   move right, raise hand = stop.
 * - The brief says "raise right hand". We accept EITHER wrist above the head,
 *   because MediaPipe's left/right labels flip depending on mirroring and a
 *   player shouldn't fail because of which hand they picked
 *   (coordinator decision, gesture module spec).
 * - STOP wins over a lean when both are seen in the same frame
 *   (tested: "wrist above nose → stop even while leaning").
 * - "Left" and "right" always mean the PLAYER's own left and right, not the
 *   image's (tested with both lean directions).
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - Lean is read from the shoulder line's tilt in image space, NOT from the
 *   landmark labels 11/12. We sort the two shoulders by x and measure the
 *   slope. If you use the labels instead, a mirrored or unmirrored feed
 *   swaps them and every lean steers the wrong way.
 * - The angle is measured in pixel proportions (x scaled by ASPECT_RATIO),
 *   not raw normalized units. Normalized x and y have different pixel
 *   lengths on a 4:3 frame, so without the scale a real 9° tilt would
 *   already cross the "12°" threshold and steering would feel twitchy.
 * - EMA smoothing on the angle plus hysteresis (enter at 12°, release under
 *   7°) prevents an angle hovering near the threshold from flickering
 *   left/none/left, which the game would read as several lane changes.
 * - A new action must win STABLE_FRAMES frames in a row before it is
 *   reported (tested: first leaning frame still returns 'none'). Without it,
 *   a single noisy frame (a hand passing the face, a bad detection) would
 *   trigger a lane change or an emergency stop.
 * - Null or empty landmarks return 'none' immediately and clear the
 *   smoothing, so a stale angle from a player who walked away can't steer
 *   the car when someone new steps in.
 * - Shoulders closer than MIN_SHOULDER_SPAN apart (player turned side-on)
 *   count as 'none'. Otherwise the tiny dx makes the slope explode toward
 *   ±90° and reads as a hard lean.
 *
 * ── DO NOT ──
 * - Do not mirror the landmarks before calling update(). The input must be
 *   the RAW, unmirrored webcam frame. Mirroring is a display concern only
 *   (CameraPreview flips the picture with CSS).
 * - Do not swap the sign convention: a positive angle (image-right shoulder
 *   lower) is the PLAYER's left. The tests pin this down.
 * - Do not share one classifier between two video sources. It keeps state
 *   (smoothing, hysteresis, stability counter) across frames.
 * - Do not add DOM or browser APIs here. This file is pure so it runs in
 *   vitest under Node.
 */

// MediaPipe Pose landmark indices
export const NOSE = 0
export const LEFT_SHOULDER = 11
export const RIGHT_SHOULDER = 12
export const LEFT_WRIST = 15
export const RIGHT_WRIST = 16

// Lean detection (degrees, measured on the shoulder line)
export const LEAN_ENTER_DEG = 12 // start leaning beyond this tilt
export const LEAN_RELEASE_DEG = 7 // stop leaning once back under this tilt
export const ANGLE_SMOOTHING = 0.5 // EMA weight of the newest frame (0..1, 1 = no smoothing)
export const ASPECT_RATIO = 640 / 480 // webcam width / height, for pixel-true angles
export const MIN_SHOULDER_SPAN = 0.05 // normalized x gap; below this the player is side-on

// Stop detection
export const STOP_MARGIN = 0.03 // wrist must be this far above the nose (normalized y)

// Confidence and stability
export const MIN_VISIBILITY = 0.5 // ignore landmarks the model isn't sure about
export const STABLE_FRAMES = 3 // frames a new action must hold before it's reported

const DEFAULTS = {
  leanEnterDeg: LEAN_ENTER_DEG,
  leanReleaseDeg: LEAN_RELEASE_DEG,
  smoothing: ANGLE_SMOOTHING,
  aspectRatio: ASPECT_RATIO,
  minShoulderSpan: MIN_SHOULDER_SPAN,
  stopMargin: STOP_MARGIN,
  minVisibility: MIN_VISIBILITY,
  stableFrames: STABLE_FRAMES,
}

const isVisible = (p, min) => !!p && (p.visibility ?? 1) >= min

/**
 * Tilt of the shoulder line in degrees, using image geometry only.
 * Positive = the image-right shoulder is lower = the player leans to THEIR left.
 * Returns null when the shoulders can't be trusted.
 */
export function shoulderAngle(landmarks, opts = DEFAULTS) {
  const a = landmarks[LEFT_SHOULDER]
  const b = landmarks[RIGHT_SHOULDER]
  if (!isVisible(a, opts.minVisibility) || !isVisible(b, opts.minVisibility)) return null
  const [imgLeft, imgRight] = a.x <= b.x ? [a, b] : [b, a]
  const dx = imgRight.x - imgLeft.x
  if (dx < opts.minShoulderSpan) return null
  const dy = imgRight.y - imgLeft.y
  return (Math.atan2(dy, dx * opts.aspectRatio) * 180) / Math.PI
}

/** True when either wrist is clearly above the nose. */
export function isHandRaised(landmarks, opts = DEFAULTS) {
  const nose = landmarks[NOSE]
  if (!isVisible(nose, opts.minVisibility)) return false
  return [LEFT_WRIST, RIGHT_WRIST].some((i) => {
    const w = landmarks[i]
    return isVisible(w, opts.minVisibility) && w.y < nose.y - opts.stopMargin
  })
}

export function createGestureClassifier(userOpts = {}) {
  const opts = { ...DEFAULTS, ...userOpts }

  let smoothAngle = null // EMA of the shoulder angle, null = no history
  let lean = 'none' // hysteresis state: 'left' | 'right' | 'none'
  let output = 'none' // the last reported action
  let pending = 'none' // candidate action waiting to become stable
  let pendingCount = 0

  function reset() {
    smoothAngle = null
    lean = 'none'
    output = 'none'
    pending = 'none'
    pendingCount = 0
  }

  function updateLean(angle) {
    if (angle === null) {
      smoothAngle = null
      lean = 'none'
      return
    }
    smoothAngle = smoothAngle === null ? angle : smoothAngle + opts.smoothing * (angle - smoothAngle)
    const a = smoothAngle
    if (lean === 'left' && a > opts.leanReleaseDeg) return
    if (lean === 'right' && a < -opts.leanReleaseDeg) return
    if (a > opts.leanEnterDeg) lean = 'left'
    else if (a < -opts.leanEnterDeg) lean = 'right'
    else lean = 'none'
  }

  function update(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      reset()
      return 'none'
    }

    // Always track the lean, even while stopping, so releasing the hand
    // returns to an up-to-date angle.
    updateLean(shoulderAngle(landmarks, opts))
    const raw = isHandRaised(landmarks, opts) ? 'stop' : lean

    if (raw === output) {
      pending = raw
      pendingCount = 0
    } else if (raw === pending) {
      pendingCount += 1
      if (pendingCount >= opts.stableFrames) {
        output = raw
        pendingCount = 0
      }
    } else {
      pending = raw
      pendingCount = 1
      if (pendingCount >= opts.stableFrames) {
        output = raw
        pendingCount = 0
      }
    }
    return output
  }

  return { update, reset }
}
