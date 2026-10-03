import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Game } from './Game'

const INITIAL_HUD = { hp: 100, ammo: 50, kills: 0, total: 0, status: 'playing' }

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

  const face = hud.hp > 66 ? '😠' : hud.hp > 33 ? '😣' : hud.hp > 0 ? '🩸' : '💀'

  return (
    <div className="root">
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

      <div className="vignette" />
      <div ref={dangerRef} className="danger" />
      <div className="grain" />
      <div ref={hurtRef} className="hurt" />
      <div className="crosshair" />
      <canvas ref={mapRef} className="minimap" width={170} height={170} />
      <div ref={gunRef} className="gun"><Gun /></div>

      <div className="hud">
        <div><span>AMMO</span><b>{hud.ammo}</b></div>
        <div><span>HEALTH</span><b>{hud.hp}%</b></div>
        <div className="face">{face}</div>
        <div><span>BESTIAS</span><b>{hud.kills}/{hud.total}</b></div>
      </div>

      {hud.status === 'playing' && !locked && (
        <div className="overlay">
          <h1>MAZE DOOM</h1>
          <p className="sub">algo te huele en la oscuridad...</p>
          <p>Haz click para jugar</p>
          <p className="small">WASD / flechas: mover · Ratón: mirar · Click: disparar · Shift: correr</p>
          <p className="small">Encuentra la salida <span style={{ color: '#3f6' }}>verde</span>. Si oyes su corazón… es el tuyo. Si ves sus ojos, uno azul y otro marrón… corre.</p>
        </div>
      )}
      {hud.status !== 'playing' && (
        <div className={`overlay ${hud.status}`}>
          <h1>{hud.status === 'won' ? '¡NIVEL COMPLETADO!' : 'TE HA ATRAPADO'}</h1>
          <p>Kills: {hud.kills}/{hud.total}</p>
          <button onClick={restart}>Reintentar (R)</button>
        </div>
      )}
    </div>
  )
}
