import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { useKeys } from './Game'
import { useJump, useMouseLook } from './look'
import { makeWaterNormals } from './textures'
import { makeDeformMaterial } from './deform'
import { createParticles } from './particles'
import { MadnessEffects } from './Effects'
import { createLightning } from './lightning'
import { HAND_TIP } from './Hand'
import { sfx } from './sfx'

const EYE = 1.7
const BOUND = 70
const HITS = 4 // disparos para romper una figura
const UP = new THREE.Vector3(0, 1, 0)
const MAX_AMMO = 60
const WHITE = new THREE.Color('#ffffff')

// Cada disparo que acierta empuja el mundo 1/HITS hacia el siguiente estado;
// cada figura rota lo lleva a un estado nuevo completo.
const WORLDS = [
  { elev: 22, azim: 180, turbidity: 2, rayleigh: 1, mie: 0.005, mieG: 0.8, clouds: 0.3, water: '#0b4a6a', sun: '#ffffff', distortion: 2.5, size: 1.2, speed: 1, exposure: 0.55, hue: 0, pillars: 0, glow: 0, stars: 0, mad: 0.04, storm: 0 },
  { elev: 2.5, azim: 205, turbidity: 9, rayleigh: 2.6, mie: 0.008, mieG: 0.95, clouds: 0.55, water: '#2a1b38', sun: '#ffa060', distortion: 3.5, size: 1, speed: 1.2, exposure: 0.7, hue: 0, pillars: 2, glow: 0.3, stars: 0.15, mad: 0.12, storm: 0.15 },
  { elev: 40, azim: 150, turbidity: 6, rayleigh: 0.2, mie: 0.003, mieG: 0.6, clouds: 0.95, water: '#14202a', sun: '#5a6878', distortion: 9, size: 0.6, speed: 3, exposure: 0.14, hue: 0, pillars: 4, glow: 0.15, stars: 0, mad: 0.25, storm: 1 },
  { elev: 35, azim: 90, turbidity: 2, rayleigh: 1.2, mie: 0.006, mieG: 0.9, clouds: 0.4, water: '#0a3a20', sun: '#e0ff80', distortion: 4, size: 1.5, speed: 1.5, exposure: 0.22, hue: 2.3, pillars: 6, glow: 0.6, stars: 0, mad: 0.38, storm: 0.3 },
  { elev: -5, azim: 240, turbidity: 1, rayleigh: 0.2, mie: 0.005, mieG: 0.8, clouds: 0.15, water: '#001018', sun: '#40ffff', distortion: 3, size: 1, speed: 0.8, exposure: 1.4, hue: 0, pillars: 8, glow: 2, stars: 1, mad: 0.3, storm: 0.1 },
  { elev: 18, azim: 300, turbidity: 12, rayleigh: 4, mie: 0.05, mieG: 0.99, clouds: 0.6, water: '#2a0004', sun: '#ff2020', distortion: 6, size: 0.8, speed: 2, exposure: 0.5, hue: 0, pillars: 10, glow: 1.2, stars: 0.3, mad: 0.5, storm: 0.6 },
  { elev: 6, azim: 120, turbidity: 3, rayleigh: 2, mie: 0.006, mieG: 0.85, clouds: 0.35, water: '#0d5560', sun: '#ffe6b0', distortion: 2.5, size: 1.3, speed: 0.8, exposure: 0.65, hue: 0, pillars: 12, glow: 0.4, stars: 0, mad: 0.06, storm: 0 },
]
const NUM_KEYS = Object.keys(WORLDS[0]).filter((k) => typeof WORLDS[0][k] === 'number')
const COLORS = WORLDS.map((w) => ({ water: new THREE.Color(w.water), sun: new THREE.Color(w.sun) }))

const FIGURES = [
  { color: '#ff3d7f', geo: () => new THREE.IcosahedronGeometry(1.3, 20) },
  { color: '#3dffd5', geo: () => new THREE.TorusKnotGeometry(0.9, 0.32, 260, 40) },
  { color: '#ffd23d', geo: () => new THREE.TorusGeometry(1.1, 0.42, 64, 160) },
  { color: '#8a5cff', geo: () => new THREE.OctahedronGeometry(1.5, 18) },
  { color: '#5cff6a', geo: () => new THREE.DodecahedronGeometry(1.35, 14) },
  { color: '#ff7a2e', geo: () => new THREE.CapsuleGeometry(0.75, 1.2, 24, 64) },
]

// Estado del mundo interpolado en t (0..WORLDS.length-1)
function sampleWorld(t, out) {
  const i = Math.min(WORLDS.length - 2, Math.floor(t))
  const f = THREE.MathUtils.smoothstep(t - i, 0, 1)
  const a = WORLDS[i]
  const b = WORLDS[i + 1]
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * f
  out.water.copy(COLORS[i].water).lerp(COLORS[i + 1].water, f)
  out.sun.copy(COLORS[i].sun).lerp(COLORS[i + 1].sun, f)
  return out
}

export function WaterWorld({ carry, onHud, onFire, onKick, onWin, gunRef, mapRef }) {
  const { camera, gl, scene } = useThree()
  const keys = useKeys()
  useMouseLook(camera)
  const jump = useJump(sfx.jump, sfx.land)
  const madRef = useRef({ madness: 0, kick: 0, hue: 0, exposure: 0.55 })
  const particles = useMemo(() => createParticles(420), [])
  const lightning = useMemo(() => createLightning({ boost: 3 }), [])
  const proxies = useRef([])
  const sunLight = useRef()
  const hemi = useRef()
  const meshes = useRef([])
  const rings = useRef([])

  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(10000)
    return s
  }, [])

  const water = useMemo(() => {
    const w = new Water(new THREE.PlaneGeometry(10000, 10000), {
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: makeWaterNormals(),
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x0b4a6a,
      distortionScale: 2.5,
      fog: false,
    })
    w.rotation.x = -Math.PI / 2
    w.userData.hit = 'water'
    return w
  }, [])

  // Cielo duplicado en una escena aparte para generar el mapa de entorno (reflejos de las figuras)
  const env = useMemo(() => {
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(sky.geometry, sky.material).copy(sky, false))
    return { scene: envScene, pmrem: new THREE.PMREMGenerator(gl), rt: null, t: 0, last: -1 }
  }, [gl, sky])
  useEffect(() => () => {
    env.rt?.dispose()
    env.pmrem.dispose()
    scene.environment = null
  }, [env, scene])

  const stars = useMemo(() => {
    const n = 2500
    const pos = new Float32Array(n * 3)
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      v.randomDirection()
      v.y = Math.abs(v.y) * 0.95 + 0.02
      v.normalize().multiplyScalar(4000).toArray(pos, i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({
      size: 2, sizeAttenuation: false, color: '#ffffff', transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    return new THREE.Points(g, m)
  }, [])

  // Monolitos que emergen del agua a medida que el mundo se transforma
  const pillars = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + 0.2
      const r = 48 + (i % 3) * 9
      const h = 18 + Math.random() * 26
      const mat = new THREE.MeshStandardMaterial({ color: '#1b1d24', metalness: 0.7, roughness: 0.25, emissive: new THREE.Color().setHSL(i / 12, 1, 0.5), emissiveIntensity: 0 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.scale.set(2.5 + Math.random() * 2, h, 2.5 + Math.random() * 2)
      mesh.position.set(Math.cos(a) * r, -h / 2 - 1, Math.sin(a) * r)
      mesh.rotation.y = Math.random() * Math.PI
      return { mesh, h, rise: 0 }
    })
  }, [])

  const figures = useMemo(
    () =>
      FIGURES.map((f, i) => {
        const a = (i / FIGURES.length) * Math.PI * 2 + Math.random() * 0.5
        const r = 13 + Math.random() * 12
        return {
          id: i, color: new THREE.Color(f.color), geometry: f.geo(), material: makeDeformMaterial(f.color),
          angle: a, radius: r, baseY: 2.4 + Math.random() * 1.8, phase: Math.random() * 10,
          orbit: (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.03),
          spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
          hp: HITS, deform: 0, kick: 0, alive: true, dying: 0, gone: false, pos: new THREE.Vector3(),
        }
      }),
    [],
  )
  useEffect(() => () => {
    for (const f of figures) { f.geometry.dispose(); f.material.dispose() }
  }, [figures])

  const st = useRef({
    hp: carry?.hp ?? 100, ammo: Math.max(carry?.ammo ?? 0, 30), kills: 0, status: 'playing',
    bob: 0, bobAmp: 0, cd: 0, flash: 0, world: 0, worldTarget: 0, kick: 0, ammoT: 0, winT: -1,
  })
  const world = useMemo(() => sampleWorld(0, { water: new THREE.Color(), sun: new THREE.Color() }), [])
  const sunDir = useMemo(() => new THREE.Vector3(), [])

  const pushHud = () => {
    const s = st.current
    onHud({
      hp: s.hp, ammo: s.ammo, kills: s.kills, total: figures.length, status: s.status,
      madness: Math.round((s.worldTarget / (WORLDS.length - 1)) * 100), label: 'FIGURAS', stage: 'water',
    })
  }

  useEffect(() => {
    camera.position.set(0, EYE, 0)
    camera.lookAt(figures[0].radius * Math.cos(figures[0].angle), EYE, figures[0].radius * Math.sin(figures[0].angle))
    pushHud()
    sfx.startSea()
    if (import.meta.env.DEV) window.__water = { camera, st, figures, water, sky }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Onda expansiva sobre el agua al romper una figura
  const spawnRing = (pos, color) => {
    const r = rings.current.find((x) => x.t >= 1)
    if (!r) return
    r.t = 0
    r.mesh.position.set(pos.x, 0.05, pos.z)
    r.mesh.material.color.copy(color)
  }

  // Disparo: rayo desde la mano; el Raycaster decide si toca una figura o el agua.
  // Las figuras se deforman en la GPU, así que se apunta contra esferas invisibles que crecen con la deformación.
  useEffect(() => {
    const dir = new THREE.Vector3()
    const tip = new THREE.Vector3()
    const end = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    raycaster.far = 300
    const onDown = (e) => {
      const s = st.current
      if (e.button !== 0 || !document.pointerLockElement || s.status !== 'playing' || s.cd > 0) return
      if (s.ammo <= 0) { sfx.empty(); s.cd = 0.25; return }
      s.ammo--
      s.cd = 0.3
      s.flash = 1
      sfx.zap()
      onFire()
      camera.getWorldDirection(dir)
      camera.localToWorld(tip.copy(HAND_TIP))
      raycaster.set(camera.position, dir)
      const hit = raycaster
        .intersectObjects([...proxies.current, water], false)
        .find((h) => h.object.userData.hit === 'water' || figures[h.object.userData.id].alive)
      end.copy(hit ? hit.point : camera.position.clone().addScaledVector(dir, 120))
      const best = hit?.object.userData.hit === 'figure' ? figures[hit.object.userData.id] : null
      const color = best ? best.color : '#a8e8ff'
      lightning.fire(tip, end, color, { width: 0.06 })
      particles.zap(tip, dir, color)

      if (best) {
        best.hp--
        best.kick = 1
        best.deform += 1 / HITS
        s.kick = 0.7
        s.worldTarget = Math.min(WORLDS.length - 1, s.worldTarget + 1 / HITS)
        particles.sparkle(hit.point, dir.clone().negate(), best.color)
        sfx.chime(best.id, HITS - best.hp)
        onKick?.()
        if (best.hp <= 0) {
          best.alive = false
          s.kills++
          s.kick = 1
          particles.burst(best.pos, best.color)
          spawnRing(best.pos, best.color)
          sfx.shatter()
          sfx.morph()
          if (s.kills === figures.length) s.winT = 3
        }
      } else if (hit) {
        particles.splash(hit.point)
        sfx.splash()
      }
      pushHud()
    }
    const onClick = () => { sfx.startAmbient(); sfx.startSea() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3() }), [])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const time = clock.elapsedTime
    const s = st.current
    const k = keys.current
    const p = camera.position
    const { fwd, right, move } = tmp

    // --- Movimiento: caminas sobre el agua ---
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    if (s.status === 'playing') {
      const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
      if (turn) camera.rotateOnWorldAxis(UP, turn * 2.4 * dt)
      right.set(-fwd.z, 0, fwd.x)
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      move.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r)
      const moving = move.lengthSq() > 0
      const run = k.ShiftLeft || k.ShiftRight
      if (moving) {
        move.normalize().multiplyScalar((run ? 8 : 5) * dt)
        p.add(move)
        const d = Math.hypot(p.x, p.z)
        if (d > BOUND) { p.x *= BOUND / d; p.z *= BOUND / d }
        s.bob += dt * (run ? 12 : 9)
      }
      s.bobAmp = THREE.MathUtils.lerp(s.bobAmp, moving ? 1 : 0, dt * 8)
    }
    // Balanceo del oleaje + paso
    p.y = EYE + Math.sin(time * 1.1) * 0.06 * (1 + world.storm * 2) + Math.sin(s.bob * 2) * 0.04 * s.bobAmp + jump.current.step(dt)

    s.cd -= dt
    s.flash = Math.max(0, s.flash - dt * 10)
    s.kick = Math.max(0, s.kick - dt * 1.2)

    // Munición que se recarga sola (el mar es generoso)
    s.ammoT -= dt
    if (s.ammo < MAX_AMMO && s.ammoT <= 0) {
      s.ammoT = 1.2
      s.ammo++
      pushHud()
    }

    // --- El mundo se transforma suavemente hacia su objetivo ---
    const prevWorld = s.world
    s.world += (s.worldTarget - s.world) * Math.min(1, dt * 0.6)
    sampleWorld(s.world, world)
    const morphing = Math.abs(s.world - prevWorld) > 1e-4

    const phi = THREE.MathUtils.degToRad(90 - world.elev)
    const theta = THREE.MathUtils.degToRad(world.azim)
    sunDir.setFromSphericalCoords(1, phi, theta)
    const su = sky.material.uniforms
    su.sunPosition.value.copy(sunDir)
    su.turbidity.value = world.turbidity
    su.rayleigh.value = world.rayleigh
    su.mieCoefficient.value = world.mie
    su.mieDirectionalG.value = world.mieG
    if (su.cloudCoverage) {
      su.cloudCoverage.value = world.clouds
      su.time.value = time
    }

    const wu = water.material.uniforms
    wu.time.value += dt * 0.6 * world.speed
    wu.sunDirection.value.copy(sunDir)
    wu.sunColor.value.copy(world.sun)
    wu.waterColor.value.copy(world.water)
    wu.distortionScale.value = world.distortion + s.kick * 4
    wu.size.value = world.size

    const day = THREE.MathUtils.clamp((world.elev + 4) / 14, 0, 1)
    sunLight.current.position.copy(sunDir).multiplyScalar(100)
    sunLight.current.color.copy(world.sun)
    sunLight.current.intensity = 0.3 + day * 2.7
    hemi.current.intensity = 0.25 + day * 0.6
    hemi.current.color.copy(world.sun).lerp(WHITE, 0.5)
    hemi.current.groundColor.copy(world.water)
    stars.material.opacity = world.stars
    stars.rotation.y = time * 0.004

    // Mapa de entorno: se regenera mientras el cielo cambia (con límite de frecuencia)
    env.t -= dt
    if (env.last < 0 || (morphing && env.t <= 0)) {
      env.t = 0.3
      env.last = s.world
      const rt = env.pmrem.fromScene(env.scene)
      env.rt?.dispose()
      env.rt = rt
      scene.environment = rt.texture
    }

    for (const [i, pl] of pillars.entries()) {
      const target = THREE.MathUtils.clamp(world.pillars - i, 0, 1)
      pl.rise += (target - pl.rise) * Math.min(1, dt * 0.5)
      pl.mesh.position.y = THREE.MathUtils.lerp(-pl.h / 2 - 1, pl.h / 2 - pl.h * 0.25, pl.rise) + Math.sin(time * 0.5 + i) * 0.3 * pl.rise
      pl.mesh.material.emissiveIntensity = world.glow * (0.6 + Math.sin(time * 2 + i) * 0.4)
    }

    // Postproceso: la locura aquí es un eco del mundo, no un ataque
    madRef.current.madness = world.mad
    madRef.current.kick = s.kick
    madRef.current.hue = world.hue
    madRef.current.exposure = world.exposure
    sfx.setMadness(world.mad)
    sfx.setSea(world.storm)
    particles.update(dt)
    lightning.update(dt, camera)

    // --- Figuras ---
    for (const f of figures) {
      const mesh = meshes.current[f.id]
      if (!mesh || f.gone) continue
      const u = f.material.userData.uniforms
      f.kick = Math.max(0, f.kick - dt * 1.5)
      f.angle += f.orbit * dt * (1 + f.deform * 2)
      f.pos.set(
        Math.cos(f.angle) * f.radius,
        f.baseY + Math.sin(time * 0.8 + f.phase) * 0.6,
        Math.sin(f.angle) * f.radius,
      )
      mesh.position.copy(f.pos)
      const proxy = proxies.current[f.id]
      if (proxy) {
        proxy.position.copy(f.pos)
        proxy.scale.setScalar(1.5 + f.deform * 0.5)
      }
      mesh.rotateOnAxis(f.spin, dt * (0.3 + f.deform * 1.5 + f.kick * 4))
      u.uTime.value = time
      u.uKick.value = f.kick
      if (f.alive) {
        u.uDeform.value += (f.deform - u.uDeform.value) * Math.min(1, dt * 4)
        mesh.scale.setScalar(1 + f.kick * 0.25)
        // Se vuelven más incandescentes cuanto más rotas están (y de noche)
        f.material.emissiveIntensity = 0.15 + f.deform * 0.8 + f.kick * 2 + world.glow * 0.4
      } else {
        // Implosión: se hincha, se retuerce y desaparece
        f.dying = Math.min(1, f.dying + dt * 1.2)
        u.uDeform.value = 1 + f.dying * 2
        const sc = f.dying < 0.3 ? 1 + f.dying * 2 : Math.max(0, 1.6 * (1 - (f.dying - 0.3) / 0.7) ** 2)
        mesh.scale.setScalar(sc)
        f.material.emissiveIntensity = 3 * (1 - f.dying)
        if (f.dying >= 1) { f.gone = true; mesh.visible = false }
      }
    }

    // Ondas expansivas
    for (const r of rings.current) {
      if (r.t >= 1) { r.mesh.visible = false; continue }
      r.t = Math.min(1, r.t + dt * 0.5)
      r.mesh.visible = true
      r.mesh.scale.setScalar(1 + r.t * 60)
      r.mesh.material.opacity = (1 - r.t) ** 2
    }

    // Victoria: deja que el mundo termine de transformarse
    if (s.winT > 0 && s.status === 'playing') {
      s.winT -= dt
      if (s.winT <= 0) {
        // Rotas todas las figuras, el mar se abre al nivel de las plataformas
        s.status = 'exit'
        sfx.morph()
        onWin?.({ hp: s.hp, ammo: s.ammo })
      }
    }

    // Arma
    if (gunRef.current) {
      const bx = Math.sin(s.bob) * 14 * s.bobAmp
      const by = Math.abs(Math.cos(s.bob)) * 10 * s.bobAmp + s.flash * 6
      gunRef.current.style.transform = `translate(${bx}px, ${by}px)`
      gunRef.current.classList.toggle('firing', s.flash > 0.5)
    }

    // Radar
    const cv = mapRef.current
    if (cv) {
      const ctx = cv.getContext('2d')
      const c = cv.width / 2
      const sc = c / (BOUND + 4)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.fillStyle = 'rgba(0,10,20,0.6)'
      ctx.beginPath()
      ctx.arc(c, c, c - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(120,220,255,0.35)'
      ctx.beginPath()
      ctx.arc(c, c, BOUND * sc, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#556'
      for (const pl of pillars) if (pl.rise > 0.05) ctx.fillRect(c + pl.mesh.position.x * sc - 2, c + pl.mesh.position.z * sc - 2, 4, 4)
      for (const f of figures) {
        if (!f.alive) continue
        ctx.fillStyle = `#${f.color.getHexString()}`
        ctx.beginPath()
        ctx.arc(c + f.pos.x * sc, c + f.pos.z * sc, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      const mx = c + p.x * sc
      const my = c + p.z * sc
      ctx.strokeStyle = '#ffee33'
      ctx.beginPath()
      ctx.moveTo(mx, my)
      ctx.lineTo(mx + fwd.x * 12, my + fwd.z * 12)
      ctx.stroke()
      ctx.fillStyle = '#ffee33'
      ctx.fillRect(mx - 2, my - 2, 4, 4)
    }
  })

  return (
    <>
      <primitive object={sky} />
      <primitive object={water} />
      <primitive object={stars} />
      {pillars.map((pl, i) => <primitive key={i} object={pl.mesh} />)}
      <directionalLight ref={sunLight} />
      <hemisphereLight ref={hemi} />
      {figures.map((f) => (
        <mesh key={f.id} ref={(el) => (meshes.current[f.id] = el)} geometry={f.geometry} material={f.material} />
      ))}
      {figures.map((f) => (
        <mesh key={`hit-${f.id}`} ref={(el) => (proxies.current[f.id] = el)} userData={{ hit: 'figure', id: f.id }}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => el && (rings.current[i] = rings.current[i] ?? { mesh: el, t: 1 })}
          rotation-x={-Math.PI / 2}
          visible={false}
        >
          <ringGeometry args={[0.9, 1, 96]} />
          <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <primitive object={particles.group} />
      <primitive object={lightning.group} />
      <MadnessEffects madRef={madRef} hdr />
    </>
  )
}
