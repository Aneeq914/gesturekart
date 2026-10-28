import GameScene from './game/GameScene.jsx'
import StartScreen from './components/StartScreen.jsx'
import HUD from './components/HUD.jsx'
import GameOver from './components/GameOver.jsx'
import { useControls } from './gesture/useControls.js'
import { useGameStore } from './store/gameStore.js'

export default function App() {
  const phase = useGameStore((s) => s.phase)

  // Webcam gestures + keyboard fallback, written into the store every frame.
  useControls()

  return (
    <div className="app">
      {/* The 3D road always fills the screen; the UI floats on top of it. */}
      <div className="scene-layer" aria-hidden="true">
        <GameScene />
      </div>

      <div className="ui-layer">
        {phase === 'start' && <StartScreen />}
        {phase === 'playing' && <HUD />}
        {phase === 'over' && <GameOver />}
      </div>
    </div>
  )
}
