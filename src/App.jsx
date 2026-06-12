import Game from './Game.jsx'

export default function App() {
  return (
    <>
      {/* Portrait gate — the game is built for 16:9, so ask phones to rotate.
          CSS-only: shown via @media (orientation: portrait) on touch devices. */}
      <div className="rotate-gate" aria-hidden="true">
        <div className="rotate-phone">▢</div>
        <p className="rotate-kicker">The Maestro's Run</p>
        <p className="rotate-msg">Rotate your device to landscape</p>
      </div>

      <div className="app-shell">
        <div className="poster-frame">
          <Game />
        </div>
        <p className="byline">
          The Maestro's Run · a dusk dash down the National Mall
        </p>
      </div>
    </>
  )
}
