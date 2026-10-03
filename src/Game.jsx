import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { MeshPortalMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { generateMaze } from './maze'
import { makeCeilTexture, makeFloorTexture, makeGlowTexture, makeWallTexture } from './textures'
import { buildDog, DOG_SIZE } from './dog'
import { createParticles } from './particles'
import { MadnessEffects } from './Effects'
import { createLightning } from './lightning'
import { HAND_TIP } from './Hand'
import { useJump, useMouseLook } from './look'
import { makeDeformMaterial } from './deform'
import { sfx } from './sfx'

export const CELL = 2
const WALL_H = 3
const EYE = 1.4
const PLAYER_R = 0.3
const MAZE_SIZE = 8
const ENEMY_COUNT = 10
const UP = new THREE.Vector3(0, 1, 0)

const toCell = (v) => Math.round(v / CELL)

// Teclas pulsadas. Solo cuentan con el ratón capturado: si hay un mensaje en pantalla, no te mueves
export function useKeys() {
  const keys = useRef({})
  useEffect(() => {
    const down = (e) => { if (document.pointerLockElement) keys.current[e.code] = true }
    const up = (e) => (keys.current[e.code] = false)
    const release = () => { if (!document.pointerLockElement) keys.current = {} }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    document.addEventListener('pointerlockchange', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      document.removeEventListener('pointerlockchange', release)
    }
  }, [])
  return keys
}

function Walls({ grid, madRef }) {
  const ref = useRef()
  const [clean, bloody] = useMemo(() => [makeWallTexture(false), makeWallTexture(true)], [])
  useFrame(() => {
    const map = madRef.current.madness > 0.35 ? bloody : clean
    if (ref.current.material.map !== map) ref.current.material.map = map
  })
  const cells = useMemo(() => {
    const out = []
    grid.forEach((row, y) => row.forEach((v, x) => v && out.push([x, y])))
    return out
  }, [grid])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach(([x, y], i) => {
      m.setPosition(x * CELL, WALL_H / 2, y * CELL)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [cells])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} userData={{ hit: 'wall' }}>
      <boxGeometry args={[CELL, WALL_H, CELL]} />
      <meshLambertMaterial map={clean} />
    </instancedMesh>
  )
}

function FloorAndCeiling({ W, H }) {
  const [floor, ceil] = useMemo(() => {
    const f = makeFloorTexture()
    const c = makeCeilTexture()
    f.repeat.set(W, H)
    c.repeat.set(W, H)
    return [f, c]
  }, [W, H])
  const cx = ((W - 1) * CELL) / 2
  const cz = ((H - 1) * CELL) / 2
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]} userData={{ hit: 'floor' }}>
        <planeGeometry args={[W * CELL, H * CELL]} />
        <meshLambertMaterial map={floor} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[cx, WALL_H, cz]} userData={{ hit: 'floor' }}>
        <planeGeometry args={[W * CELL, H * CELL]} />
        <meshLambertMaterial map={ceil} />
      </mesh>
    </>
  )
}

// Lo que se ve a través del portal de salida: el mar de cristal, con sus figuras flotando
function SeaGlimpse() {
  const figs = useMemo(
    () => [
      { geo: new THREE.IcosahedronGeometry(0.9, 12), mat: makeDeformMaterial('#ff3d7f'), pos: [-2.2, 1.2, -7] },
      { geo: new THREE.TorusKnotGeometry(0.6, 0.22, 160, 24), mat: makeDeformMaterial('#3dffd5'), pos: [1.8, 1.8, -9] },
      { geo: new THREE.OctahedronGeometry(0.9, 10), mat: makeDeformMaterial('#ffd23d'), pos: [0.2, 0.6, -13] },
    ],
    [],
  )
  const refs = useRef([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    figs.forEach((f, i) => {
      f.mat.userData.uniforms.uTime.value = t
      f.mat.userData.uniforms.uDeform.value = 0.25 + Math.sin(t * 0.7 + i) * 0.2
      const m = refs.current[i]
      if (m) { m.rotation.set(t * 0.4 + i, t * 0.6, 0); m.position.y = f.pos[1] + Math.sin(t + i * 2) * 0.3 }
    })
  })
  return (
    <>
      <color attach="background" args={['#9fd2ea']} />
      <fog attach="fog" args={['#bfe3f0', 6, 30]} />
      <hemisphereLight args={['#fff4dd', '#0b4a6a', 1.6]} />
      <directionalLight position={[3, 6, 2]} intensity={2.5} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.3, -12]}>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color="#0b5a7a" metalness={0.6} roughness={0.15} />
      </mesh>
      <mesh position={[3, 4, -25]}>
        <circleGeometry args={[2, 32]} />
        <meshBasicMaterial color="#fff6d8" fog={false} />
      </mesh>
      {figs.map((f, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={f.geo} material={f.mat} position={f.pos} />
      ))}
    </>
  )
}

// Salida del laberinto: un portal en mitad de la última celda, mirando hacia el pasillo
// por el que se llega. Su luz se ve desde lejos para que no pase desapercibido.
function Exit({ x, y, facing }) {
  const ring = useRef()
  const light = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ring.current.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5
    light.current.intensity = 5 + Math.sin(t * 3) * 1.5
  })
  return (
    <group position={[x * CELL, 1.35, y * CELL]} rotation-y={facing}>
      <mesh ref={ring}>
        <torusGeometry args={[0.95, 0.06, 16, 64]} />
        <meshStandardMaterial color="#123" emissive="#4fd1ff" emissiveIntensity={1.2} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.92, 48]} />
        <MeshPortalMaterial resolution={512}>
          <SeaGlimpse />
        </MeshPortalMaterial>
      </mesh>
      <pointLight ref={light} color="#7fe0ff" intensity={5} distance={9} decay={1} position-z={0.6} />
    </group>
  )
}

export function Game({ onHud, onHurt, onFire, onKick, onExit, gunRef, mapRef, vignetteRef }) {
  const { camera } = useThree()
  useMouseLook(camera)
  const jump = useJump(sfx.jump, sfx.land)
  const keys = useKeys()
  const light = useRef()
  const glow = useRef()
  const sprites = useRef([])
  const ambient = useRef()
  const madRef = useRef({ madness: 0, kick: 0 })
  const particles = useMemo(() => createParticles(), [])
  const lightning = useMemo(() => createLightning(), [])
  const targets = useRef([])

  const level = useMemo(() => {
    const grid = generateMaze(MAZE_SIZE, MAZE_SIZE)
    const H = grid.length
    const W = grid[0].length
    const free = []
    grid.forEach((row, y) => row.forEach((v, x) => !v && free.push([x, y])))
    const exit = [W - 2, H - 2]
    const enemies = free
      .filter(([x, y]) => x + y > 6 && !(x === exit[0] && y === exit[1]))
      .sort(() => Math.random() - 0.5)
      .slice(0, ENEMY_COUNT)
      .map(([x, y], id) => ({
        id, x: x * CELL, z: y * CELL, hp: 3, alive: true, aware: false,
        hitT: 0, atk: 0, deadT: 0, phase: Math.random() * 10,
        yaw: Math.random() * Math.PI * 2, growlT: 2 + Math.random() * 4,
      }))
    // El portal mira hacia el pasillo abierto por el que se llega a la salida
    const [ex, ey] = exit
    const exitFacing =
      grid[ey][ex - 1] === 0 ? -Math.PI / 2 : grid[ey - 1]?.[ex] === 0 ? Math.PI : grid[ey][ex + 1] === 0 ? Math.PI / 2 : 0
    return { grid, W, H, exit, exitFacing, enemies }
  }, [])

  const dogImage = useLoader(THREE.ImageLoader, '/dog.png')
  const dog = useMemo(() => buildDog(dogImage), [dogImage])
  const dogMats = useMemo(
    () => level.enemies.map(() => new THREE.MeshLambertMaterial({ map: dog.normalTexture, alphaTest: 0.5 })),
    [level, dog],
  )
  const eyeMats = useMemo(() => {
    const glow = makeGlowTexture()
    return dog.eyes.map(
      (eye) =>
        new THREE.SpriteMaterial({
          map: glow, color: eye.color, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false, transparent: true, opacity: 0,
        }),
    )
  }, [dog])

  const st = useRef({
    hp: 100, ammo: 50, kills: 0, status: 'playing', bob: 0, bobAmp: 0, cd: 0, flash: 0,
    flowT: 0, flow: null, beatT: 0, flicker: 0, madness: 0, kick: 0,
  })
  const { scene } = useThree()
  const fogColor = useMemo(() => new THREE.Color(), [])
  useEffect(() => {
    const t = light.current.target
    scene.add(t)
    return () => scene.remove(t)
  }, [scene])

  const isWall = (x, z) => level.grid[toCell(z)]?.[toCell(x)] !== 0
  const blocked = (x, z, r = PLAYER_R) =>
    isWall(x - r, z - r) || isWall(x + r, z - r) || isWall(x - r, z + r) || isWall(x + r, z + r)
  const los = (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az)
    const steps = Math.ceil(d / 0.25)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (isWall(ax + (bx - ax) * t, az + (bz - az) * t)) return false
    }
    return true
  }

  const pushHud = () => {
    const s = st.current
    const total = level.enemies.length
    onHud({ hp: s.hp, ammo: s.ammo, kills: s.kills, total, status: s.status, madness: Math.round((s.kills / total) * 100), label: 'BESTIAS', stage: 'maze' })
  }

  // Posición inicial mirando hacia el pasillo abierto
  useEffect(() => {
    camera.position.set(CELL, EYE, CELL)
    if (level.grid[1][2] === 0) camera.lookAt(CELL * 2, EYE, CELL)
    else camera.lookAt(CELL, EYE, CELL * 2)
    pushHud()
    if (import.meta.env.DEV) window.__maze = { camera, level, st, particles, lightning }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Disparo: rayo desde la mano, resuelto con un Raycaster contra paredes, suelo/techo y perros
  useEffect(() => {
    const dir = new THREE.Vector3()
    const tip = new THREE.Vector3()
    const end = new THREE.Vector3()
    const n = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    raycaster.far = 30
    const onDown = (e) => {
      const s = st.current
      if (e.button !== 0 || !document.pointerLockElement || s.status !== 'playing' || s.cd > 0) return
      if (s.ammo <= 0) { sfx.empty(); s.cd = 0.25; return }
      s.ammo--
      s.cd = 0.35
      s.flash = 1
      sfx.zap()
      onFire()
      if (!targets.current.length) scene.traverse((o) => o.userData.hit && targets.current.push(o))
      camera.getWorldDirection(dir)
      camera.localToWorld(tip.copy(HAND_TIP))
      raycaster.set(camera.position, dir)
      const hit = raycaster
        .intersectObjects(targets.current, false)
        .find((h) => h.object.userData.hit !== 'enemy' || level.enemies[h.object.userData.id].alive)
      end.copy(hit ? hit.point : camera.position.clone().addScaledVector(dir, raycaster.far))
      const color = s.madness > 0.5 && Math.random() < s.madness ? new THREE.Color().setHSL(Math.random(), 1, 0.65) : '#8fd8ff'
      lightning.fire(tip, end, color)
      particles.zap(tip, dir, color)

      if (hit?.object.userData.hit === 'enemy') {
        const best = level.enemies[hit.object.userData.id]
        particles.impactFlesh(hit.point, dir.clone().negate(), s.madness)
        best.hp--
        best.hitT = 0.15
        best.aware = true
        if (best.hp <= 0) {
          best.alive = false
          s.kills++
          s.kick = 1
          onKick?.()
          sfx.whimper()
        } else sfx.yelp()
      } else if (hit) {
        n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
        particles.impactWall(end.addScaledVector(n, 0.04), n)
      }
      pushHud()
    }
    const onClick = () => sfx.startAmbient()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3() }), [])

  // Campo de flujo BFS desde el jugador: los enemigos lo siguen cuando no te ven
  const computeFlow = (px, py) => {
    const { grid, W, H } = level
    const dist = new Int16Array(W * H).fill(-1)
    const q = [px + py * W]
    dist[q[0]] = 0
    for (let i = 0; i < q.length; i++) {
      const c = q[i]
      const x = c % W
      const y = (c - x) / W
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        const n = nx + ny * W
        if (grid[ny]?.[nx] === 0 && dist[n] < 0) {
          dist[n] = dist[c] + 1
          q.push(n)
        }
      }
    }
    return dist
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = st.current
    const k = keys.current
    const p = camera.position
    const { fwd, right, move } = tmp

    if (s.status === 'playing') {
      const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
      if (turn) camera.rotateOnWorldAxis(UP, turn * 2.4 * dt)

      camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      right.set(-fwd.z, 0, fwd.x)
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      move.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r)
      const moving = move.lengthSq() > 0
      const run = k.ShiftLeft || k.ShiftRight
      if (moving) {
        move.normalize().multiplyScalar((run ? 7 : 4.5) * dt)
        if (!blocked(p.x + move.x, p.z)) p.x += move.x
        if (!blocked(p.x, p.z + move.z)) p.z += move.z
        s.bob += dt * (run ? 14 : 10)
      }
      s.bobAmp = THREE.MathUtils.lerp(s.bobAmp, moving ? 1 : 0, dt * 8)
      p.y = EYE + Math.sin(s.bob * 2) * 0.05 * s.bobAmp + jump.current.step(dt)

      // Atravesar el portal (llegar al centro de la última celda) lleva al mar
      if (Math.hypot(p.x - level.exit[0] * CELL, p.z - level.exit[1] * CELL) < 0.45) {
        s.status = 'exit'
        sfx.portal()
        onExit({ hp: s.hp, ammo: s.ammo, kills: s.kills, total: level.enemies.length })
      }
    }

    s.cd -= dt
    s.flash = Math.max(0, s.flash - dt * 10)

    // --- Locura: sube con cada perro eliminado ---
    const madTarget = s.kills / level.enemies.length
    s.madness += (madTarget - s.madness) * Math.min(1, dt * 0.8)
    s.kick = Math.max(0, s.kick - dt * 1.2)
    const m = s.madness
    madRef.current.madness = m
    madRef.current.kick = s.kick
    sfx.setMadness(m)
    if (s.status === 'playing' && m > 0.25 && Math.random() < dt * m * m * 1.5) {
      Math.random() < 0.5 ? sfx.shriek() : sfx.cackle()
    }
    // Al principio: luz cálida y niebla lejana. Luego: oscuridad roja y niebla que se cierra
    // Al final, la luz vuelve... pero ciclando colores imposibles
    ambient.current.intensity = THREE.MathUtils.lerp(1.4, 0.12, Math.min(1, m * 1.6)) + Math.max(0, m - 0.65) * 2.2
    if (m > 0.65) ambient.current.color.setHSL((performance.now() / 2500) % 1, 1, 0.6)
    else ambient.current.color.setRGB(1, THREE.MathUtils.lerp(0.92, 0.3, m), THREE.MathUtils.lerp(0.82, 0.25, m))
    scene.fog.near = THREE.MathUtils.lerp(5, 1, m)
    scene.fog.far = THREE.MathUtils.lerp(32, 11, Math.min(1, m * 1.4))
    if (m > 0.6) fogColor.setHSL((performance.now() / 4000) % 1, 0.9, (m - 0.6) * 0.35)
    else fogColor.set(0, 0, 0)
    scene.fog.color.copy(fogColor)
    scene.background.copy(fogColor)
    for (const mat of dogMats) mat.map = m > 0.3 ? dog.texture : dog.normalTexture
    for (const mat of eyeMats) mat.opacity = Math.min(1, Math.max(0, (m - 0.15) * 2.5))
    particles.update(dt)
    lightning.update(dt, camera)

    // Linterna (spot) que a veces parpadea + fogonazo
    if (s.flicker <= 0 && Math.random() < 0.006 * m) s.flicker = 0.2 + Math.random() * 0.6
    s.flicker -= dt
    const flick = s.flicker > 0 ? (Math.random() < 0.5 ? 0.05 : 0.6) : 1
    light.current.position.copy(p)
    light.current.target.position.copy(p).addScaledVector(camera.getWorldDirection(tmp.move), 5)
    light.current.intensity = 30 * flick + s.flash * 60
    glow.current.position.copy(p)
    glow.current.intensity = 0.6 + s.flash * 25

    // Arma: balanceo y retroceso
    if (gunRef.current) {
      const bx = Math.sin(s.bob) * 14 * s.bobAmp
      const by = Math.abs(Math.cos(s.bob)) * 10 * s.bobAmp + s.flash * 6
      gunRef.current.style.transform = `translate(${bx}px, ${by}px)`
      gunRef.current.classList.toggle('firing', s.flash > 0.5)
    }

    // IA de enemigos
    const pcx = toCell(p.x)
    const pcy = toCell(p.z)
    s.flowT -= dt
    if (s.flowT <= 0 || !s.flow) {
      s.flow = computeFlow(pcx, pcy)
      s.flowT = 0.25
    }
    const { W } = level
    let nearest = Infinity
    for (const e of level.enemies) {
      const grp = sprites.current[e.id]
      if (!grp) continue
      const mat = dogMats[e.id]
      e.hitT -= dt

      if (!e.alive) {
        // Cae de lado y se queda tirado
        e.deadT = Math.min(1, e.deadT + dt * 3)
        grp.rotation.set(0, e.yaw, -e.deadT * Math.PI * 0.48)
        grp.position.set(e.x, THREE.MathUtils.lerp(DOG_SIZE / 2, 0.3, e.deadT), e.z)
        mat.color.set('#4a1515')
        for (const ch of grp.children) if (ch.isSprite) ch.visible = false
        continue
      }

      const dx = p.x - e.x
      const dz = p.z - e.z
      const dist = Math.hypot(dx, dz)
      const sees = dist < 14 && los(e.x, e.z, p.x, p.z)
      const ecx = toCell(e.x)
      const ecy = toCell(e.z)
      if (!e.aware && (sees || s.flow[ecx + ecy * W] < 4)) {
        e.aware = true
        sfx.bark(Math.max(0.08, 0.4 - dist * 0.03))
      }
      if (e.aware) nearest = Math.min(nearest, dist)

      if (e.aware && s.status === 'playing') {
        let tx = p.x
        let tz = p.z
        if (!sees) {
          // Siguiente celda por el campo de flujo
          let bestD = s.flow[ecx + ecy * W]
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const d = s.flow[ecx + ox + (ecy + oy) * W]
            if (d >= 0 && d < bestD) {
              bestD = d
              tx = (ecx + ox) * CELL
              tz = (ecy + oy) * CELL
            }
          }
        }
        const mx = tx - e.x
        const mz = tz - e.z
        const ml = Math.hypot(mx, mz)
        if (dist > 1.0 && ml > 0.01) {
          const step = (sees ? 3.0 : 2.6) * (1 + m * 0.5) * dt
          const nx = e.x + (mx / ml) * step
          const nz = e.z + (mz / ml) * step
          if (!blocked(nx, e.z, 0.25)) e.x = nx
          if (!blocked(e.x, nz, 0.25)) e.z = nz
        }
        e.growlT -= dt
        if (e.growlT <= 0 && dist < 12) {
          e.growlT = 3 + Math.random() * 4
          if (Math.random() < 0.3) sfx.bark(Math.max(0.05, 0.35 - dist * 0.025))
          else sfx.growl(Math.max(0.03, 0.25 - dist * 0.02))
        }
        e.atk -= dt
        if (dist < 1.3 && e.atk <= 0) {
          e.atk = 0.9
          s.hp = Math.max(0, s.hp - 12)
          sfx.bite()
          onHurt()
          if (s.hp <= 0) {
            s.status = 'dead'
            document.exitPointerLock()
          }
          pushHud()
        }
      }

      // Gira hacia el jugador con retardo (así se aprecia el volumen 3D)
      const target = Math.atan2(dx, dz)
      const diff = THREE.MathUtils.euclideanModulo(target - e.yaw + Math.PI, Math.PI * 2) - Math.PI
      e.yaw += diff * Math.min(1, dt * (e.aware ? 3 : 0.6))
      e.phase += dt * (e.aware ? 10 : 1.5)
      const lunge = e.aware ? Math.abs(Math.sin(e.phase)) : 0
      grp.position.set(e.x, DOG_SIZE / 2 + lunge * 0.12, e.z)
      grp.rotation.set(e.aware ? Math.sin(e.phase) * 0.08 : 0, e.yaw, Math.sin(e.phase * 0.5) * 0.04)
      mat.color.set(e.hitT > 0 ? '#ff2020' : '#ffffff')
      // Ojos: pulsan y se encienden más cuando te persigue
      const eyeScale = (e.aware ? 0.32 : 0.2) * (0.85 + Math.sin(e.phase * 0.7) * 0.15)
      for (const ch of grp.children) if (ch.isSprite) ch.scale.setScalar(eyeScale)
    }

    // Latido: más rápido y fuerte cuanto más cerca está la bestia
    s.beatT -= dt
    if (s.status === 'playing' && nearest < 10 && s.beatT <= 0) {
      s.beatT = 0.35 + (nearest / 10) * 0.9
      sfx.heartbeat(0.6 - nearest * 0.04)
    }
    if (vignetteRef.current) vignetteRef.current.style.opacity = nearest < 10 ? 1 - nearest / 10 : 0

    // Minimapa redondo centrado en el jugador. La salida siempre se ve: si queda fuera
    // del círculo, un marcador en el borde apunta hacia ella
    const cv = mapRef.current
    if (cv) {
      const ctx = cv.getContext('2d')
      const W = cv.width
      const c = W / 2
      const sz = W / 11
      const px = p.x / CELL
      const pz = p.z / CELL
      ctx.clearRect(0, 0, W, W)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath()
      ctx.arc(c, c, c, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#7a3a26'
      level.grid.forEach((row, y) => row.forEach((v, x) => v && ctx.fillRect(c + (x - px - 0.5) * sz, c + (y - pz - 0.5) * sz, sz, sz)))
      let ex = c + (level.exit[0] - px) * sz
      let ey = c + (level.exit[1] - pz) * sz
      const d = Math.hypot(ex - c, ey - c)
      const edge = c - 9
      if (d > edge) { ex = c + ((ex - c) / d) * edge; ey = c + ((ey - c) / d) * edge }
      const pulse = 5 + Math.sin(performance.now() / 200) * 1.5
      ctx.fillStyle = '#4fd1ff'
      ctx.shadowColor = '#4fd1ff'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(ex, ey, pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#ffee33'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.lineTo(c + fwd.x * sz * 1.2, c + fwd.z * sz * 1.2)
      ctx.stroke()
      ctx.fillStyle = '#ffee33'
      ctx.fillRect(c - 3, c - 3, 6, 6)
    }
  })

  return (
    <>
      <color attach="background" args={['#000']} />
      <fog attach="fog" args={['#000', 5, 32]} />
      <ambientLight ref={ambient} intensity={1.4} />
      <spotLight ref={light} color="#ffe2b0" angle={0.55} penumbra={0.6} distance={16} decay={1} />
      <pointLight ref={glow} color="#ff9966" distance={4} decay={1} />
      <Walls grid={level.grid} madRef={madRef} />
      <primitive object={particles.group} />
      <primitive object={lightning.group} />
      <FloorAndCeiling W={level.W} H={level.H} />
      <Exit x={level.exit[0]} y={level.exit[1]} facing={level.exitFacing} />
      {level.enemies.map((e, i) => (
        <group key={e.id} ref={(el) => (sprites.current[e.id] = el)} position={[e.x, DOG_SIZE / 2, e.z]}>
          <mesh geometry={dog.geometry} material={dogMats[i]} />
          {/* Volumen de impacto invisible para el raycaster */}
          <mesh userData={{ hit: 'enemy', id: e.id }}>
            <sphereGeometry args={[0.65, 8, 6]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          {/* Parte trasera: misma malla espejada */}
          <mesh geometry={dog.geometry} material={dogMats[i]} scale={[1, 1, -1]} />
          {dog.eyes.map((eye, k) => (
            <sprite key={k} material={eyeMats[k]} position={eye.pos} scale={0.25} />
          ))}
        </group>
      ))}
      <MadnessEffects madRef={madRef} />
    </>
  )
}
