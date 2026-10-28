/**
 * Game rules: every number that decides how GestureKart is scored and paced.
 *
 * ── IN SIMPLE WORDS ──
 * This is the rule book. It says how long a round lasts, how fast the car
 * drives, and how many points you win or lose for each thing you do on the
 * road. Change a number here and the whole game follows it.
 *
 * ── BUSINESS RULES ──
 * - Red-light violation (crossing the zebra/stop line on red) = heavy
 *   penalty. Source: hackathon brief §2 "Red Light Violations".
 * - Clean lane change = points. Source: brief §2 "Lane Discipline".
 *   In this simple version a lane change counts as "clean" when you dodge a
 *   car that was blocking your lane without hitting it.
 * - Proper stop at a red light = reward. Without this, a careful driver could
 *   never score well, only lose fewer points.
 * - Hitting a blocking car = penalty, so you can't ignore lane discipline.
 * - Score card at game over with a grade. Source: brief §2 "Civic Score Card".
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - All tuning lives in one file so the 3D scene, the HUD and the score card
 *   always agree. If you copy a number into another file instead of importing
 *   it, the score card can show a different value from the one the game used.
 * - Distances are in metres and the scene uses 1 unit = 1 metre. The light
 *   timings (YELLOW_AT/RED_AT) assume CRUISE_SPEED. If you raise the speed
 *   without moving those distances, players get less time to react and the
 *   red light becomes impossible to stop for.
 *
 * ── DO NOT ──
 * - Do not hard-code points anywhere else. Always use POINTS[type].
 * - Do not rename EVENT types: the store, the HUD and the score card all use
 *   these keys.
 */

export const GAME_DURATION = 75 // seconds per round
export const START_SCORE = 100

export const LANES = [-3, 0, 3] // x position (metres) of the 3 lane centres
export const START_LANE = 1 // index into LANES (middle lane)

export const CRUISE_SPEED = 16.7 // m/s (about 60 km/h)
export const BRAKE_DECEL = 12 // m/s² when the stop gesture is held
export const ACCEL = 6 // m/s² when speeding back up to cruise

export const LIGHT_SPACING = 190 // metres between traffic lights
export const LIGHT_YELLOW_AT = 75 // light turns yellow when car is this far from the stop line
export const LIGHT_RED_AT = 50 // light turns red when car is this far from the stop line
export const LIGHT_RED_CHANCE = 0.7 // chance a light turns red (otherwise stays green)
export const LIGHT_GREEN_AFTER_STOP = 2.5 // seconds a stopped car waits before red turns green

export const OBSTACLE_SPAWN_AHEAD = 110 // obstacle appears this far ahead, in the player's lane
export const OBSTACLE_MIN_GAP = 25 // never spawn an obstacle this close to a stop line

export const EVENT = {
  RED_LIGHT: 'RED_LIGHT',
  CLEAN_STOP: 'CLEAN_STOP',
  CLEAN_LANE_CHANGE: 'CLEAN_LANE_CHANGE',
  COLLISION: 'COLLISION',
}

export const POINTS = {
  [EVENT.RED_LIGHT]: -50,
  [EVENT.CLEAN_STOP]: 20,
  [EVENT.CLEAN_LANE_CHANGE]: 5,
  [EVENT.COLLISION]: -30,
}

export const EVENT_LABEL = {
  [EVENT.RED_LIGHT]: 'Red light jumped',
  [EVENT.CLEAN_STOP]: 'Stopped at red',
  [EVENT.CLEAN_LANE_CHANGE]: 'Clean lane change',
  [EVENT.COLLISION]: 'Collision',
}

/** Grade shown on the score card. Thresholds are checked top to bottom. */
export const GRADES = [
  { min: 160, grade: 'A', title: 'Road Champion' },
  { min: 120, grade: 'B', title: 'Responsible Driver' },
  { min: 80, grade: 'C', title: 'Needs Practice' },
  { min: -Infinity, grade: 'D', title: 'Danger on the Road' },
]

export function getGrade(score) {
  return GRADES.find((g) => score >= g.min)
}

export const kmh = (metresPerSecond) => Math.round(metresPerSecond * 3.6)
