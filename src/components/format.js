// Tiny display helpers shared by the HUD, StartScreen and GameOver.

// +20 / −50 (true minus sign, so it lines up with the plus in tabular figures)
export const formatPoints = (points) =>
  points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0'

// 'good' | 'bad' | 'neutral', used as a data-tone attribute for colour
export const toneOf = (points) => (points > 0 ? 'good' : points < 0 ? 'bad' : 'neutral')

// 75 -> '1:15'
export const formatClock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
