import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Game } from './Game'
import { sfx } from './sfx'

const INITIAL_HUD = { hp: 100, ammo: 50, kills: 0, total: 0, status: 'playing', madness: 0 }

function Gun() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" shapeRendering="crispEdges">
      <g className="flash">
        <polygon points="60,0 70,18 92,12 78,30 60,26 42,30 28,12 50,18" fill="#ffd34d" />
        <rect x="52" y="14" width="16" height="14" fill="#fff6c0" />
      </g>
      <rect x="52" y="30" width="16" height="44" fill="#4a4a4a" />
      <rect x="54" y="30" width="4" height="44" fill="#6d6d6d" />
      <rect x="50" y="28" width="20" height="6" fill="#2a2a2a" />
      <rect x="46" y="70" width="28" height="20" fill="#333" />
      <polygon points="30,120 40,84 56,78 64,78 80,84 92,120" fill="#b97a50" />
      <rect x="44" y="86" width="32" height="6" fill="#8a5636" />
    </svg>
  )
}

// Volumen: deslizador + silencio. Teclas: M silencia, - / + ajustan.
function VolumeControl() {
  const [vol, setVol] = useState(sfx.getVolume)
  const lastVol = useRef(vol || 0.7)

  const apply = useCallback((v) => {
    v = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
    if (v > 0) lastVol.current = v
    sfx.setVolume(v)
    setVol(v)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyM') apply(sfx.getVolume() > 0 ? 0 : lastVol.current)
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') apply(sfx.getVolume() - 0.1)
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') apply(sfx.getVolume() + 0.1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apply])

  const icon = vol === 0 ? '🔇' : vol < 0.35 ? '🔈' : vol < 0.7 ? '🔉' : '🔊'
  // Evita que el click en el control capture el ratón o dispare
  const stop = (e) => e.stopPropagation()

  return (
    <div className="volume" onClick={stop} onMouseDown={stop}>
      <button title="Silenciar (M)" onClick={() => apply(vol > 0 ? 0 : lastVol.current)}>{icon}</button>
      <input
        type="range" min="0" max="1" step="0.01" value={vol}
        aria-label="Volumen"
        onChange={(e) => apply(parseFloat(e.target.value))}
      />
      <span>{Math.round(vol * 100)}%</span>
    </div>
  )
}

export default function App() {
  const [run, setRun] = useState(0)
  const [hud, setHud] = useState(INITIAL_HUD)
  const [locked, setLocked] = useState(false)
  const gunRef = useRef()
  const hurtRef = useRef()
  const mapRef = useRef()
  const dangerRef = useRef()

  const onHurt = useCallback(() => {
    const el = hurtRef.current
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
  }, [])
  const onFire = useCallback(() => {}, [])

  const restart = useCallback(() => {
    setHud(INITIAL_HUD)
    setLocked(false)
    setRun((r) => r + 1)
  }, [])

  useEffect(() => {
    const onKey = (e) => e.code === 'KeyR' && hud.status !== 'playing' && restart()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hud.status, restart])

  const face =
    hud.hp <= 0 ? '💀'
      : hud.madness >= 80 ? '🤪'
      : hud.madness >= 50 ? '😵‍💫'
      : hud.hp > 66 ? '🙂' : hud.hp > 33 ? '😣' : '🩸'
  const madClass = hud.madness >= 70 ? 'insane' : hud.madness >= 40 ? 'unhinged' : ''

  return (
    <div className={`root ${madClass}`} style={{ '--mad': hud.madness / 100 }}>
      <Canvas key={run} dpr={0.5} gl={{ antialias: false }} camera={{ fov: 75, near: 0.05, far: 40 }}>
        <Suspense fallback={null}>
        <Game
          playing={hud.status === 'playing'}
          onHud={setHud}
          onHurt={onHurt}
          onFire={onFire}
          onLock={setLocked}
          gunRef={gunRef}
          mapRef={mapRef}
          vignetteRef={dangerRef}
        />
        </Suspense>
      </Canvas>

      <div ref={dangerRef} className="danger" />
      <div ref={hurtRef} className="hurt" />
      <div className="crosshair" />
      <VolumeControl />
      <canvas ref={mapRef} className="minimap" width={170} height={170} />
      <div ref={gunRef} className="gun"><Gun /></div>

      <div className="hud">
        <div><span>AMMO</span><b>{hud.ammo}</b></div>
        <div><span>HEALTH</span><b>{hud.hp}%</b></div>
        <div className="face">{face}</div>
        <div><span>BESTIAS</span><b>{hud.kills}/{hud.total}</b></div>
        <div className="madness">
          <span>LOCURA</span>
          <i><em style={{ width: `${hud.madness}%` }} /></i>
        </div>
      </div>

      {hud.status === 'playing' && !locked && (
        <div className="overlay">
          <h1>MAZE DOOM</h1>
          <p className="sub">solo es un laberinto con perritos… ¿verdad?</p>
          <p>Haz click para jugar</p>
          <p className="small">WASD / flechas: mover · Ratón: mirar · Click: disparar · Shift: correr</p>
          <p className="small">Volumen: arriba a la izquierda · M silencia · - / + ajustan</p>
          <p className="small">Encuentra la salida <span style={{ color: '#3f6' }}>verde</span>. Cada perro que eliminas te acerca un poco más a la locura.</p>
        </div>
      )}
      {hud.status !== 'playing' && (
        <div className={`overlay ${hud.status}`}>
          <h1>{hud.status === 'won' ? '¡NIVEL COMPLETADO!' : 'TE HA ATRAPADO'}</h1>
          <p>Bestias: {hud.kills}/{hud.total} · Locura: {hud.madness}%</p>
          <button onClick={restart}>Reintentar (R)</button>
        </div>
      )}
    </div>
  )
}
