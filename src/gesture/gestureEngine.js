/**
 * The webcam + pose-model engine: one camera stream, one PoseLandmarker,
 * one detection loop for the whole app, writing the gesture into the store.
 *
 * ── IN SIMPLE WORDS ──
 * This is the game's "eyes". When the player clicks "Enable camera" it
 * turns on the webcam, downloads a small body-tracking model, and then, many
 * times a second, looks at the latest camera picture, finds the player's
 * body and decides "left / right / stop / nothing" (see classifyPose.js).
 * It writes that answer into the shared store so the car can react.
 * There is only ever one of it, like there is only one webcam light.
 *
 * ── BUSINESS RULES ──
 * - Hackathon brief §2 Camera Controls: the car is steered by body gestures
 *   seen by the webcam, with the keyboard as a fallback.
 * - A held keyboard key beats the camera (gesture module spec): while
 *   isKeyboardActive() is true this engine keeps tracking but does not write
 *   to the store, so the two sources never fight over the input.
 * - When nobody is in view the status becomes 'no-body' with the message
 *   "Step back so your shoulders and hands are visible", and the input goes
 *   back to 'none' so the car doesn't keep steering on its own.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - Module-level singleton + idempotent startCamera(): a second click, a
 *   React StrictMode double effect or a second preview must not open a
 *   second getUserMedia stream. Two streams double the decode cost, and on
 *   some systems the second request fails with "device in use".
 * - The video element is created here and shared via getVideo(). Previews
 *   draw from it instead of asking for the camera again, for the same reason.
 * - The video is attached to the page (1px, transparent) instead of being
 *   left detached or display:none. Browsers are allowed to throttle or pause
 *   videos that aren't rendered; if that happens, currentTime stops moving
 *   and detection silently freezes.
 * - detectForVideo only runs when video.currentTime has changed and is
 *   always given a strictly increasing timestamp. The MediaPipe graph
 *   behind VIDEO mode rejects packets whose timestamp isn't strictly
 *   increasing, and re-processing the same frame just burns frame budget.
 * - @mediapipe/tasks-vision is imported lazily inside startCamera(). Nothing
 *   touches window/navigator/document at import time, so this module can be
 *   imported in vitest (Node) and the heavy bundle only loads on demand.
 * - The WASM files come from the CDN pinned to the INSTALLED package version
 *   (TASKS_VISION_VERSION). A JS bundle and WASM from different versions can
 *   fail to load with cryptic errors.
 * - GPU delegate first, CPU fallback: GPU is much faster where WebGL works,
 *   but it fails on some machines and headless browsers; without the
 *   fallback those players would get no camera controls at all.
 * - A run token guards every await. If stopCamera() is called while the
 *   camera or model is still loading, the late result is thrown away instead
 *   of resurrecting a stream the user just turned off.
 * - 'no-body' needs NO_BODY_FRAMES missed frames in a row, so a single
 *   dropped detection doesn't flash the "Step back" message.
 *
 * ── DO NOT ──
 * - Do not call navigator.mediaDevices.getUserMedia anywhere else. Use
 *   startCamera() / getVideo().
 * - Do not mirror the video frames before detection. classifyPose expects
 *   the raw, unmirrored frame; mirroring is a CSS display concern only.
 * - Do not bump @mediapipe/tasks-vision without updating
 *   TASKS_VISION_VERSION to match.
 * - Do not add top-level DOM access (document, window, navigator) to this
 *   file; it breaks importing it in tests and during SSR-like tooling.
 */
import { useGameStore } from '../store/gameStore.js'
import { createGestureClassifier } from './classifyPose.js'

// Must match node_modules/@mediapipe/tasks-vision/package.json "version".
export const TASKS_VISION_VERSION = '1.2.0'
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

const NO_BODY_FRAMES = 8 // consecutive empty detections before showing 'no-body'

const MSG = {
  starting: 'Starting camera…',
  loadingModel: 'Loading pose model…',
  ready: 'Camera ready',
  noBody: 'Step back so your shoulders and hands are visible',
  insecure: 'Camera needs HTTPS or localhost',
  denied: 'Camera access was blocked. Allow it in the address bar, or play with the keyboard.',
  notFound: 'No camera found. You can still play with the keyboard.',
  busy: 'Your camera is busy in another app. Close it and try again.',
  model: 'Couldn’t load the pose model. Check your connection and try again.',
  generic: 'Couldn’t start the camera. Try again, or play with the keyboard.',
}

let video = null
let stream = null
let landmarker = null
let landmarkerPromise = null
let startPromise = null
let rafId = 0
let runToken = 0
let lastVideoTime = -1
let lastTimestamp = 0
let missedFrames = 0
let keyboardActive = false
let latest = { landmarks: null, action: 'none' }
const classifier = createGestureClassifier()

const store = () => useGameStore.getState()

/** True while useControls has a driving key held down. */
export function isKeyboardActive() {
  return keyboardActive
}

/** Called by useControls: while true the camera stops writing input. */
export function setKeyboardActive(active) {
  keyboardActive = !!active
}

/** The shared hidden <video> element (null until startCamera() first runs). */
export function getVideo() {
  return video
}

/** The latest detection: raw (unmirrored) landmarks or null, and the classified action. */
export function getLatestPose() {
  return latest
}

/** True while the camera stream is live and the detection loop is running. */
export function isCameraRunning() {
  return rafId !== 0
}

function ensureVideo() {
  if (video) return video
  video = document.createElement('video')
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  Object.assign(video.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  })
  document.body.appendChild(video)
  return video
}

function loadLandmarker() {
  if (landmarker) return Promise.resolve(landmarker)
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      const create = (delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
      try {
        landmarker = await create('GPU')
      } catch (err) {
        console.warn('[gesture] GPU delegate failed, falling back to CPU', err)
        landmarker = await create('CPU')
      }
      return landmarker
    })().catch((err) => {
      landmarkerPromise = null // allow a retry later
      err.isModelError = true
      throw err
    })
  }
  return landmarkerPromise
}

function releaseStream() {
  if (stream) stream.getTracks().forEach((t) => t.stop())
  stream = null
  if (video) video.srcObject = null
}

function writeInput(action) {
  if (!keyboardActive) store().setInput(action, 'camera')
}

function loop() {
  rafId = requestAnimationFrame(loop)
  if (!landmarker || !video || video.readyState < 2) return
  if (video.currentTime === lastVideoTime) return // no new frame yet
  lastVideoTime = video.currentTime

  // VIDEO mode needs a strictly increasing timestamp in ms.
  const now = performance.now()
  const timestamp = now > lastTimestamp ? now : lastTimestamp + 1
  lastTimestamp = timestamp

  let result
  try {
    result = landmarker.detectForVideo(video, timestamp)
  } catch (err) {
    console.warn('[gesture] detectForVideo failed', err)
    return
  }

  const landmarks = result?.landmarks?.[0]?.length ? result.landmarks[0] : null
  const action = classifier.update(landmarks)
  latest = { landmarks, action }

  if (landmarks) {
    missedFrames = 0
    if (store().camera.status !== 'ready') store().setCameraStatus('ready', MSG.ready)
  } else if (++missedFrames >= NO_BODY_FRAMES) {
    store().setCameraStatus('no-body', MSG.noBody)
  }
  writeInput(action)
}

function describeError(err) {
  if (err?.isModelError) return ['error', MSG.model]
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return ['denied', MSG.denied]
    case 'SecurityError':
      return ['error', MSG.insecure]
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return ['error', MSG.notFound]
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return ['error', MSG.busy]
    default:
      return ['error', MSG.generic]
  }
}

async function start() {
  const { setCameraStatus } = store()
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    setCameraStatus('error', MSG.insecure)
    return
  }

  const token = ++runToken
  setCameraStatus('loading', MSG.starting)
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    })
    if (token !== runToken) {
      s.getTracks().forEach((t) => t.stop())
      return
    }
    stream = s
    const v = ensureVideo()
    v.srcObject = s
    await v.play()
    if (token !== runToken) return

    if (!landmarker) setCameraStatus('loading', MSG.loadingModel)
    await loadLandmarker()
    if (token !== runToken) return

    classifier.reset()
    latest = { landmarks: null, action: 'none' }
    lastVideoTime = -1
    missedFrames = 0
    setCameraStatus('ready', MSG.ready)
    rafId = requestAnimationFrame(loop)
  } catch (err) {
    if (token !== runToken) return
    console.warn('[gesture] camera start failed', err)
    releaseStream()
    const [status, message] = describeError(err)
    setCameraStatus(status, message)
  }
}

/**
 * Turn on the webcam and start pose detection. Safe to call repeatedly:
 * while loading it returns the same promise, while running it resolves at
 * once. Never rejects; failures land in the store's `camera` status.
 */
export function startCamera() {
  if (startPromise) return startPromise
  if (isCameraRunning()) return Promise.resolve()
  const p = start().finally(() => {
    if (startPromise === p) startPromise = null // a stop + restart may own it now
  })
  startPromise = p
  return p
}

/** Stop the webcam and the detection loop. The loaded model is kept for a fast restart. */
export function stopCamera() {
  runToken++ // invalidates any start() still awaiting
  startPromise = null
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  releaseStream()
  classifier.reset()
  latest = { landmarks: null, action: 'none' }
  missedFrames = 0
  store().setCameraStatus('idle', '')
  // With the camera off the keyboard is the only control left, so the HUD
  // must stop saying "Camera" as the input source.
  if (!keyboardActive) store().setInput('none', 'keyboard')
}
