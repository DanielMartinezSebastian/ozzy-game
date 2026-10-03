import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Game } from './Game'
import { WaterWorld } from './WaterWorld'
import { Beach } from './Beach'
import { SkyRealm } from './SkyRealm'
import { Intro } from './Intro'
import { HandView } from './Hand'
import { FaceView } from './Face'
import { sfx } from './sfx'

const MAZE_HUD = { hp: 100, ammo: 50, kills: 0, total: 0, status: 'playing', madness: 0, label: 'BESTIAS', stage: 'maze' }
const BEACH_HUD = { hp: 100, ammo: null, kills: 0, total: 0, status: 'playing', madness: 0, label: 'PUERTA', stage: 'beach' }

// ?nivel=playa | 1 | 2 | 3 | final salta directamente a una fase (útil para probar)
const STAGES = { playa: 'beach', 1: 'maze', 2: 'water', 3: 'sky', final: 'ending' }
const START_STAGE = STAGES[new URLSearchParams(location.search).get('nivel')] ?? 'intro'

const ZONES = { beach: 'La playa', maze: 'El laberinto', water: 'El mar de cristal', sky: 'El ascenso', ending: 'La playa' }

// Final: frases sueltas, sin marco, que aparecen y se van; la última se queda
const ENDING = [
  { text: '¿Fue un sueño?', at: 2.5, until: 7 },
  { text: 'Espera…', at: 8, until: 11 },
  { text: '¿Y Ozzy?', at: 12, until: Infinity },
]

function EndingText() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const id = setInterval(() => setT((performance.now() - start) / 1000), 200)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="ending">
      {ENDING.map((l) => t >= l.at && t < l.until && <p key={l.text} className="ending-line">{l.text}</p>)}
      {t > 17 && <p className="ending-hint">R para volver a soñar</p>}
    </div>
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
        style={{ '--v': `${vol * 100}%` }}
        onChange={(e) => apply(parseFloat(e.target.value))}
      />
      <span>{Math.round(vol * 100)}</span>
    </div>
  )
}

function Meter({ label, value, max, kind }) {
  const pct = value == null ? 100 : Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`meter ${kind}`}>
      <div className="meter-head">
        <span>{label}</span>
        <b>{value == null ? '∞' : value}</b>
      </div>
      <div className="meter-track"><i style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

export default function App() {
  const [run, setRun] = useState(0)
  const [stage, setStage] = useState(START_STAGE)
  const [carry, setCarry] = useState(null)
  const [hud, setHud] = useState(START_STAGE === 'maze' ? MAZE_HUD : BEACH_HUD)
  const [locked, setLocked] = useState(false)
  const gunRef = useRef()
  const hurtRef = useRef()
  const mapRef = useRef()
  const dangerRef = useRef()
  // Eventos visuales compartidos con la mano y la cara (se leen cada frame)
  const fxRef = useRef({ fire: 0, hurt: 0, faceKick: 0, psy: 0, color: '#7fd4ff' })

  const onHurt = useCallback(() => {
    fxRef.current.hurt = 1
    const el = hurtRef.current
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
  }, [])
  const onFire = useCallback(() => { fxRef.current.fire = 1 }, [])
  const onKick = useCallback(() => { fxRef.current.faceKick = 1 }, [])

  // El ratón se captura sobre <body>: así el bloqueo sobrevive a los cambios de nivel
  // y se pasa de uno a otro sin pantallas intermedias
  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])
  useEffect(() => {
    const onClick = () => {
      if (stage !== 'intro' && hud.status !== 'dead' && !document.pointerLockElement) document.body.requestPointerLock()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [stage, hud.status])

  const goto = useCallback((next, nextHud) => {
    setStage(next)
    setHud(nextHud)
    setRun((r) => r + 1)
  }, [])

  // Túnel: tapa la pantalla al instante (no se llega a ver lo que hay detrás del portal)
  // y el cambio de nivel ocurre por debajo, en pleno remolino
  const [warp, setWarp] = useState(0)
  const warpTo = useCallback((next, nextHud) => {
    setWarp((w) => w + 1)
    setTimeout(() => goto(next, nextHud), 350)
  }, [goto])
  useEffect(() => {
    if (!warp) return
    const t = setTimeout(() => setWarp(0), 1500)
    return () => clearTimeout(t)
  }, [warp])

  // Playa -> laberinto -> mar -> ascenso -> playa (fin)
  const onEnterPortal = useCallback(() => warpTo('maze', MAZE_HUD), [warpTo])
  const onExitMaze = useCallback((stats) => {
    setCarry(stats)
    warpTo('water', { ...MAZE_HUD, hp: stats.hp, ammo: stats.ammo, label: 'FIGURAS', stage: 'water' })
  }, [warpTo])
  const onWinWater = useCallback((stats) => {
    sfx.stopSea()
    setCarry(stats)
    warpTo('sky', { ...BEACH_HUD, hp: stats.hp, label: 'ASCENSO', stage: 'sky' })
  }, [warpTo])
  const onEnterLastPortal = useCallback(() => warpTo('ending', { ...BEACH_HUD, stage: 'ending' }), [warpTo])

  const restart = useCallback(() => {
    sfx.stopSea()
    setCarry(null)
    if (stage === 'ending') {
      document.exitPointerLock()
      goto('intro', BEACH_HUD)
    } else goto('maze', MAZE_HUD)
  }, [goto, stage])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyR' && (hud.status === 'dead' || stage === 'ending')) restart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hud.status, stage, restart])

  const water = stage === 'water'
  const scenic = stage === 'beach' || stage === 'ending'
  // Psicodelia de la cara: con la locura en el laberinto, con la transformación en el mar
  const psy = stage === 'maze' ? Math.max(0, (hud.madness - 35) / 65) : water ? (hud.madness / 100) * 0.6 : 0
  fxRef.current.psy = psy
  const madClass = stage === 'maze' ? (hud.madness >= 70 ? 'insane' : hud.madness >= 40 ? 'unhinged' : '') : ''

  const startFromIntro = () => {
    document.body.requestPointerLock()
    goto('beach', BEACH_HUD)
  }
  if (stage === 'intro') return <Intro onDone={startFromIntro} />

  const levelProps = { onHud: setHud, onFire, onKick, gunRef, mapRef }
  const fov = water ? 70 : 75

  return (
    <div className={`root stage-${stage} ${madClass}`} style={{ '--mad': hud.madness / 100 }}>
      {stage === 'maze' ? (
        <Canvas key={`maze-${run}`} dpr={0.5} gl={{ antialias: false }} camera={{ fov, near: 0.05, far: 40 }}>
          <Suspense fallback={null}>
            <Game {...levelProps} onHurt={onHurt} onExit={onExitMaze} vignetteRef={dangerRef} />
          </Suspense>
        </Canvas>
      ) : (
        // Mar, cielo y playa a resolución completa: aquí el detalle importa
        <Canvas key={`${stage}-${run}`} dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov, near: 0.1, far: 20000 }}>
          <Suspense fallback={null}>
            {water && <WaterWorld {...levelProps} carry={carry} onWin={onWinWater} />}
            {stage === 'sky' && <SkyRealm {...levelProps} carry={carry} onEnter={onEnterLastPortal} />}
            {scenic && <Beach {...levelProps} ending={stage === 'ending'} onEnter={onEnterPortal} />}
          </Suspense>
        </Canvas>
      )}

      <div ref={dangerRef} className="danger" />
      <div ref={hurtRef} className="hurt" />
      {warp > 0 && (
        <div key={warp} className="warp">
          <i className="warp-rings" />
          <i className="warp-streaks" />
          <i className="warp-core" />
        </div>
      )}
      <div className="crosshair"><i /></div>
      <div ref={gunRef} className="gun"><HandView fxRef={fxRef} fov={fov} /></div>

      <VolumeControl />
      {stage !== 'ending' && (
        <>
          <div className="map-wrap">
            <canvas ref={mapRef} className="minimap" width={170} height={170} />
            <span className="zone">{ZONES[stage]}</span>
          </div>

          <div className="hud">
            <div className="panel vitals">
              <Meter label="VIDA" value={hud.hp} max={100} kind="hp" />
              <Meter label="PODER" value={hud.ammo} max={60} kind="power" />
            </div>
            <div className={`portrait ${psy > 0.15 ? 'psy' : ''} ${hud.hp < 35 ? 'low' : ''}`}>
              <FaceView fxRef={fxRef} hp={hud.hp} psy={psy} dead={hud.status === 'dead'} />
            </div>
            <div className="panel objective">
              {scenic ? (
                <div className="objective-text">
                  <span>OBJETIVO</span>
                  <b>Cruza la puerta</b>
                </div>
              ) : stage === 'sky' ? (
                <>
                  <div className="meter-head"><span>ASCENSO</span><b>{hud.kills}/{hud.total}</b></div>
                  <div className="objective-text"><b>Llega al último portal</b></div>
                </>
              ) : (
                <>
                  <div className="meter-head"><span>{hud.label}</span><b>{hud.kills}/{hud.total}</b></div>
                  <Meter label={water ? 'MUNDO' : 'LOCURA'} value={hud.madness} max={100} kind={water ? 'world' : 'madness'} />
                </>
              )}
            </div>
          </div>
        </>
      )}

      {stage === 'ending' && <EndingText />}

      {/* Sin marcos: solo letras */}
      {hud.status === 'playing' && !locked && stage !== 'ending' && (
        <div className="prompt">
          <p>click para continuar</p>
          <span>WASD mover · ratón mirar · click rayo · espacio saltar · Shift correr</span>
        </div>
      )}
      {hud.status === 'dead' && (
        <div className="prompt dead" onClick={restart}>
          <p>Te ha atrapado</p>
          <span>R o click para volver a intentarlo</span>
        </div>
      )}
    </div>
  )
}
