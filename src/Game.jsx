import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { generateMaze } from './maze'
import { makeCeilTexture, makeFloorTexture, makeGlowTexture, makeWallTexture } from './textures'
import { buildDog, DOG_SIZE } from './dog'
import { createParticles } from './particles'
import { MadnessEffects } from './Effects'
import { sfx } from './sfx'

export const CELL = 2
const WALL_H = 3
const EYE = 1.4
const PLAYER_R = 0.3
const MAZE_SIZE = 8
const ENEMY_COUNT = 10
const UP = new THREE.Vector3(0, 1, 0)

const toCell = (v) => Math.round(v / CELL)

function useKeys() {
  const keys = useRef({})
  useEffect(() => {
    const down = (e) => (keys.current[e.code] = true)
    const up = (e) => (keys.current[e.code] = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
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
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
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
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]}>
        <planeGeometry args={[W * CELL, H * CELL]} />
        <meshLambertMaterial map={floor} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[cx, WALL_H, cz]}>
        <planeGeometry args={[W * CELL, H * CELL]} />
        <meshLambertMaterial map={ceil} />
      </mesh>
    </>
  )
}

function Exit({ x, y }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    ref.current.material.opacity = 0.35 + Math.sin(clock.elapsedTime * 4) * 0.15
  })
  return (
    <group position={[x * CELL, 0, y * CELL]}>
      <mesh ref={ref} position-y={WALL_H / 2}>
        <cylinderGeometry args={[0.7, 0.7, WALL_H, 16, 1, true]} />
        <meshBasicMaterial color="#33ff66" transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <circleGeometry args={[0.8, 16]} />
        <meshBasicMaterial color="#1aff55" />
      </mesh>
      <pointLight color="#33ff66" intensity={6} distance={8} decay={1} position-y={1.5} />
    </group>
  )
}

export function Game({ playing, onHud, onHurt, onFire, onLock, gunRef, mapRef, vignetteRef }) {
  const { camera } = useThree()
  const keys = useKeys()
  const light = useRef()
  const glow = useRef()
  const sprites = useRef([])
  const ambient = useRef()
  const madRef = useRef({ madness: 0, kick: 0 })
  const particles = useMemo(() => createParticles(), [])

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
    return { grid, W, H, exit, enemies }
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
    onHud({ hp: s.hp, ammo: s.ammo, kills: s.kills, total, status: s.status, madness: Math.round((s.kills / total) * 100) })
  }

  // Posición inicial mirando hacia el pasillo abierto
  useEffect(() => {
    camera.position.set(CELL, EYE, CELL)
    if (level.grid[1][2] === 0) camera.lookAt(CELL * 2, EYE, CELL)
    else camera.lookAt(CELL, EYE, CELL * 2)
    pushHud()
    if (import.meta.env.DEV) window.__maze = { camera, level, st, particles }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Disparo
  useEffect(() => {
    const dir = new THREE.Vector3()
    const v = new THREE.Vector3()
    const onDown = (e) => {
      const s = st.current
      if (e.button !== 0 || !document.pointerLockElement || s.status !== 'playing' || s.cd > 0) return
      if (s.ammo <= 0) { sfx.empty(); s.cd = 0.25; return }
      s.ammo--
      s.cd = 0.35
      s.flash = 1
      sfx.shoot()
      onFire()
      camera.getWorldDirection(dir)
      particles.muzzle(camera.localToWorld(v.set(0, -0.12, -0.5)), dir, s.madness)
      let best = null
      let bestT = Infinity
      for (const en of level.enemies) {
        if (!en.alive) continue
        v.set(en.x, DOG_SIZE / 2, en.z).sub(camera.position)
        const t = v.dot(dir)
        if (t <= 0 || t > bestT) continue
        const perp = v.addScaledVector(dir, -t).length()
        if (perp < 0.65 && los(camera.position.x, camera.position.z, en.x, en.z)) {
          best = en
          bestT = t
        }
      }
      // Dónde choca la bala con pared/suelo/techo
      const o = camera.position
      let wallT = 30
      for (let t = 0.1; t < 30; t += 0.05) {
        const y = o.y + dir.y * t
        if (isWall(o.x + dir.x * t, o.z + dir.z * t) || y <= 0 || y >= WALL_H) { wallT = t; break }
      }
      if (best && bestT < wallT) {
        particles.impactFlesh(v.copy(o).addScaledVector(dir, bestT), dir.clone().negate(), s.madness)
      } else if (wallT < 30) {
        best = null
        const hit = v.copy(o).addScaledVector(dir, wallT - 0.06)
        const prev = o.clone().addScaledVector(dir, wallT - 0.11)
        const n = new THREE.Vector3()
        if (hit.y <= 0.05) n.set(0, 1, 0)
        else if (hit.y >= WALL_H - 0.05) n.set(0, -1, 0)
        else if (toCell(o.x + dir.x * wallT) !== toCell(prev.x)) n.set(-Math.sign(dir.x), 0, 0)
        else n.set(0, 0, -Math.sign(dir.z))
        particles.impactWall(hit, n)
      }
      if (best) {
        best.hp--
        best.hitT = 0.15
        best.aware = true
        if (best.hp <= 0) {
          best.alive = false
          s.kills++
          s.kick = 1
          sfx.whimper()
        } else sfx.yelp()
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
      p.y = EYE + Math.sin(s.bob * 2) * 0.05 * s.bobAmp

      if (toCell(p.x) === level.exit[0] && toCell(p.z) === level.exit[1]) {
        s.status = 'won'
        sfx.win()
        document.exitPointerLock()
        pushHud()
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
      const by = Math.abs(Math.cos(s.bob)) * 10 * s.bobAmp + s.flash * 30
      gunRef.current.style.transform = `translate(calc(-50% + ${bx}px), ${by}px)`
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

    // Minimapa
    const cv = mapRef.current
    if (cv) {
      const ctx = cv.getContext('2d')
      const sz = cv.width / level.W
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.fillStyle = '#5a2a1a'
      level.grid.forEach((row, y) => row.forEach((v, x) => v && ctx.fillRect(x * sz, y * sz, sz, sz)))
      ctx.fillStyle = '#33ff66'
      ctx.fillRect(level.exit[0] * sz, level.exit[1] * sz, sz, sz)
      const mx = (p.x / CELL + 0.5) * sz
      const my = (p.z / CELL + 0.5) * sz
      ctx.strokeStyle = '#ffee33'
      ctx.beginPath()
      ctx.moveTo(mx, my)
      ctx.lineTo(mx + fwd.x * sz * 1.2, my + fwd.z * sz * 1.2)
      ctx.stroke()
      ctx.fillStyle = '#ffee33'
      ctx.fillRect(mx - 2, my - 2, 4, 4)
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
      <FloorAndCeiling W={level.W} H={level.H} />
      <Exit x={level.exit[0]} y={level.exit[1]} />
      {level.enemies.map((e, i) => (
        <group key={e.id} ref={(el) => (sprites.current[e.id] = el)} position={[e.x, DOG_SIZE / 2, e.z]}>
          <mesh geometry={dog.geometry} material={dogMats[i]} />
          {/* Parte trasera: misma malla espejada */}
          <mesh geometry={dog.geometry} material={dogMats[i]} scale={[1, 1, -1]} />
          {dog.eyes.map((eye, k) => (
            <sprite key={k} material={eyeMats[k]} position={eye.pos} scale={0.25} />
          ))}
        </group>
      ))}
      <MadnessEffects madRef={madRef} />
      {playing && <PointerLockControls onLock={() => onLock(true)} onUnlock={() => onLock(false)} />}
    </>
  )
}
