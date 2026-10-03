import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshPortalMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useKeys } from './Game'
import { useMouseLook } from './look'
import { createParticles } from './particles'
import { createLightning } from './lightning'
import { HAND_TIP } from './Hand'
import { MadnessEffects } from './Effects'
import { sfx } from './sfx'

const EYE = 1.6
const G = 24
const JUMP = 9.2
const R = 0.28 // radio del jugador al pisar
const FALL_Y = -14
const UP = new THREE.Vector3(0, 1, 0)

// Camino de plataformas: [x, y (superficie), z, ancho, fondo, movimiento]
// movimiento: { axis, amp, speed } — eje en el que oscila
const PLATFORMS = [
  [0, 0, 0, 6, 6],
  [0, 0.5, -6.5, 3, 3],
  [2.5, 1.2, -11, 2.5, 2.5],
  [-1, 1.8, -15, 2.5, 2.5],
  [-1, 1.8, -20, 3, 3, { axis: 'x', amp: 3, speed: 0.8 }],
  [2, 2.6, -24.5, 2, 2],
  [5, 3.4, -27.5, 2, 2],
  [5, 3.4, -32, 3, 3, { axis: 'y', amp: 1.2, speed: 0.9 }],
  [1.5, 4.4, -35, 2.2, 2.2],
  [-2, 5.2, -37.5, 2, 2],
  [-2, 5.2, -42, 2.5, 2.5, { axis: 'z', amp: 2, speed: 0.7 }],
  [1, 6, -46, 2, 2],
  [1, 6.6, -50, 1.6, 1.6],
  [-2, 7.4, -53, 1.8, 1.8],
  [0, 8, -58, 6, 6],
]
const LAST = PLATFORMS.length - 1
const PORTAL_Z = -60
const PORTAL_R = 1.5

// Mar de nubes muy por debajo: fbm de ruido que se desplaza
const cloudVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const cloudFrag = /* glsl */ `
uniform float time;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 p = vUv * 24.0 + vec2(time * 0.03, time * 0.012);
  float c = fbm(p + fbm(p * 0.5 + time * 0.02) * 1.5);
  float edge = smoothstep(0.5, 0.2, distance(vUv, vec2(0.5)));
  vec3 col = mix(vec3(0.55, 0.42, 0.75), vec3(1.0, 0.86, 0.9), c);
  gl_FragColor = vec4(col * 1.6, smoothstep(0.35, 0.7, c) * edge);
}`

// Lo que se ve a través del último portal: la playa al atardecer
function BeachGlimpse() {
  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(80)
    const u = s.material.uniforms
    u.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(80), THREE.MathUtils.degToRad(235))
    u.turbidity.value = 4
    u.rayleigh.value = 2.2
    return s
  }, [])
  return (
    <>
      <primitive object={sky} />
      <hemisphereLight args={['#ffe2c0', '#c9a27a', 2]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.9, -6]}>
        <planeGeometry args={[60, 12]} />
        <meshStandardMaterial color="#d9bf91" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -2.0, -30]}>
        <planeGeometry args={[200, 40]} />
        <meshStandardMaterial color="#0e5a6e" metalness={0.7} roughness={0.12} />
      </mesh>
    </>
  )
}

export function SkyRealm({ carry, onHud, onFire, onEnter, gunRef, mapRef }) {
  const { camera, gl, scene } = useThree()
  const keys = useKeys()
  useMouseLook(camera)
  const madRef = useRef({ madness: 0.05, kick: 0, hue: 0, exposure: 0.3 })
  const particles = useMemo(() => createParticles(200), [])
  const lightning = useMemo(() => createLightning({ boost: 3 }), [])
  const meshes = useRef([])
  const ring = useRef()
  const clouds = useRef()

  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(10000)
    const u = s.material.uniforms
    u.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(115))
    u.turbidity.value = 8
    u.rayleigh.value = 3
    u.mieCoefficient.value = 0.008
    u.mieDirectionalG.value = 0.9
    if (u.cloudCoverage) u.cloudCoverage.value = 0.25
    return s
  }, [])

  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(sky.geometry, sky.material).copy(sky, false))
    const rt = pm.fromScene(envScene)
    scene.environment = rt.texture
    return () => { rt.dispose(); pm.dispose(); scene.environment = null }
  }, [gl, scene, sky])

  const plats = useMemo(
    () =>
      PLATFORMS.map(([x, y, z, w, d, move], i) => {
        const color = new THREE.Color().setHSL((0.55 + i * 0.045) % 1, 0.7, 0.72)
        return {
          i, w, d, move, base: new THREE.Vector3(x, y, z), pos: new THREE.Vector3(x, y, z), prev: new THREE.Vector3(x, y, z),
          geo: new RoundedBoxGeometry(w, 0.5, d, 4, 0.12),
          mat: new THREE.MeshPhysicalMaterial({
            color, roughness: 0.25, metalness: 0.1, clearcoat: 1, iridescence: 0.8,
            emissive: color, emissiveIntensity: i === LAST ? 0.25 : 0.1,
          }),
        }
      }),
    [],
  )
  // Cristales flotando a lo lejos, de decorado
  const shards = useMemo(
    () =>
      Array.from({ length: 26 }, () => {
        const a = Math.random() * Math.PI * 2
        const r = 25 + Math.random() * 45
        return {
          pos: [Math.cos(a) * r, -6 + Math.random() * 26, -30 + Math.sin(a) * r],
          s: 0.6 + Math.random() * 2.2,
          spin: Math.random() * 0.5 + 0.1,
          color: new THREE.Color().setHSL(Math.random(), 0.6, 0.75),
        }
      }),
    [],
  )
  const shardRefs = useRef([])

  const st = useRef({
    feet: new THREE.Vector3(0, 0, 2), vy: 0, ground: plats[0], coyote: 0, jumpBuf: 0, checkpoint: 0, best: 0,
    bob: 0, bobAmp: 0, cd: 0, flash: 0, entered: false, prevZ: 2, hp: carry?.hp ?? 100,
  })

  const pushHud = () => {
    const s = st.current
    onHud({ hp: s.hp, ammo: null, kills: s.best, total: LAST, status: 'playing', madness: 0, label: 'ASCENSO', stage: 'sky' })
  }

  useEffect(() => {
    camera.position.set(0, EYE, 2)
    camera.lookAt(0, EYE + 0.4, -8)
    pushHud()
    if (import.meta.env.DEV) window.__sky = { camera, st, plats }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Saltar con espacio (con "buffer": si lo pulsas justo antes de aterrizar, también vale)
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Space' && document.pointerLockElement) { st.current.jumpBuf = 0.12; e.preventDefault() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Rayos: aquí no hay enemigos, solo chispas contra las plataformas
  useEffect(() => {
    const dir = new THREE.Vector3()
    const tip = new THREE.Vector3()
    const end = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    raycaster.far = 120
    const onDown = (e) => {
      const s = st.current
      if (e.button !== 0 || !document.pointerLockElement || s.cd > 0) return
      s.cd = 0.3
      s.flash = 1
      sfx.zap()
      onFire()
      camera.getWorldDirection(dir)
      camera.localToWorld(tip.copy(HAND_TIP))
      raycaster.set(camera.position, dir)
      const hit = raycaster.intersectObjects(meshes.current.filter(Boolean), false)[0]
      end.copy(hit ? hit.point : camera.position.clone().addScaledVector(dir, 60))
      lightning.fire(tip, end, '#d9b8ff', { width: 0.05 })
      particles.zap(tip, dir, '#d9b8ff')
      if (hit) particles.sparkle(hit.point, dir.clone().negate(), new THREE.Color('#ffffff'))
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3(), d: new THREE.Vector3() }), [])
  const onPlat = (pl, x, z) => Math.abs(x - pl.pos.x) <= pl.w / 2 + R && Math.abs(z - pl.pos.z) <= pl.d / 2 + R

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const time = clock.elapsedTime
    const s = st.current
    const k = keys.current
    const f = s.feet
    const { fwd, right, move, d } = tmp

    // 1. Plataformas móviles
    for (const pl of plats) {
      pl.prev.copy(pl.pos)
      if (pl.move) pl.pos[pl.move.axis] = pl.base[pl.move.axis] + Math.sin(time * pl.move.speed) * pl.move.amp
      const m = meshes.current[pl.i]
      if (m) m.position.set(pl.pos.x, pl.pos.y - 0.25, pl.pos.z)
    }
    // La plataforma te lleva consigo
    if (s.ground) f.add(d.subVectors(s.ground.pos, s.ground.prev))

    // 2. Movimiento horizontal (también en el aire)
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    let moving = false
    if (!s.entered) {
      const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
      if (turn) camera.rotateOnWorldAxis(UP, turn * 2.4 * dt)
      right.set(-fwd.z, 0, fwd.x)
      const fw = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      move.set(0, 0, 0).addScaledVector(fwd, fw).addScaledVector(right, r)
      moving = move.lengthSq() > 0
      if (moving) {
        move.normalize().multiplyScalar((k.ShiftLeft || k.ShiftRight ? 8.5 : 5.5) * dt)
        f.x += move.x
        f.z += move.z
      }
    }

    // 3. Suelo, salto y gravedad
    if (s.ground && !onPlat(s.ground, f.x, f.z)) s.ground = null
    if (s.ground) { f.y = s.ground.pos.y; s.vy = 0; s.coyote = 0.1 } else s.coyote -= dt
    s.jumpBuf -= dt
    if (s.jumpBuf > 0 && s.coyote > 0 && !s.entered) {
      s.vy = JUMP
      s.ground = null
      s.coyote = 0
      s.jumpBuf = 0
      sfx.jump()
    }
    if (!s.ground) {
      const prevY = f.y
      s.vy -= G * dt
      f.y += s.vy * dt
      if (s.vy <= 0) {
        for (const pl of plats) {
          if (onPlat(pl, f.x, f.z) && prevY >= pl.prev.y - 0.05 && f.y <= pl.pos.y) {
            f.y = pl.pos.y
            s.vy = 0
            s.ground = pl
            sfx.land()
            if (!pl.move && pl.i > s.checkpoint) s.checkpoint = pl.i
            if (pl.i > s.best) { s.best = pl.i; pushHud() }
            break
          }
        }
      }
    }

    // 4. Caída al vacío: vuelves al último punto seguro
    if (f.y < FALL_Y) {
      const cp = plats[s.checkpoint]
      f.set(cp.pos.x, cp.pos.y, cp.pos.z)
      s.vy = 0
      s.ground = cp
      sfx.fall()
      madRef.current.kick = 1
    }

    if (s.ground && moving) s.bob += dt * 9
    s.bobAmp = THREE.MathUtils.lerp(s.bobAmp, s.ground && moving ? 1 : 0, dt * 8)
    camera.position.set(f.x, f.y + EYE + Math.sin(s.bob * 2) * 0.04 * s.bobAmp, f.z)

    // 5. Último portal: de vuelta a la playa
    if (!s.entered && s.prevZ > PORTAL_Z && f.z <= PORTAL_Z && Math.abs(f.x) < PORTAL_R * 0.9 && f.y > 7) {
      s.entered = true
      sfx.portal()
      onEnter()
    }
    s.prevZ = f.z

    s.cd -= dt
    s.flash = Math.max(0, s.flash - dt * 10)
    madRef.current.kick = Math.max(0, madRef.current.kick - dt * 1.5)
    particles.update(dt)
    lightning.update(dt, camera)
    if (clouds.current) clouds.current.material.uniforms.time.value = time
    if (ring.current) ring.current.material.emissiveIntensity = 0.8 + Math.sin(time * 3) * 0.3
    shards.forEach((sh, i) => {
      const m = shardRefs.current[i]
      if (m) { m.rotation.set(time * sh.spin, time * sh.spin * 0.7, 0); m.position.y = sh.pos[1] + Math.sin(time * 0.5 + i) * 0.8 }
    })

    if (gunRef.current) {
      const bx = Math.sin(s.bob) * 14 * s.bobAmp
      const by = Math.abs(Math.cos(s.bob)) * 10 * s.bobAmp + s.flash * 6
      gunRef.current.style.transform = `translate(${bx}px, ${by}px)`
    }

    // Mapa: las plataformas vistas desde arriba, centradas en ti
    const cv = mapRef.current
    if (cv) {
      const ctx = cv.getContext('2d')
      const W = cv.width
      const sc = W / 40
      ctx.fillStyle = '#1a1430'
      ctx.fillRect(0, 0, W, W)
      for (const pl of plats) {
        ctx.fillStyle = pl.i === LAST ? '#c9a8ff' : pl.i <= s.best ? '#8a7fb0' : '#e8dcff'
        ctx.fillRect(W / 2 + (pl.pos.x - pl.w / 2 - f.x) * sc, W / 2 + (pl.pos.z - pl.d / 2 - f.z) * sc, pl.w * sc, pl.d * sc)
      }
      ctx.strokeStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(W / 2, W / 2)
      ctx.lineTo(W / 2 + fwd.x * 12, W / 2 + fwd.z * 12)
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.fillRect(W / 2 - 2, W / 2 - 2, 4, 4)
    }
  })

  const last = PLATFORMS[LAST]

  return (
    <>
      <primitive object={sky} />
      <hemisphereLight args={['#ffe0f0', '#5a3a8a', 0.9]} />
      <directionalLight position={[60, 20, -30]} intensity={2.2} color="#ffd2b8" />
      <mesh ref={clouds} rotation-x={-Math.PI / 2} position={[0, -22, -30]}>
        <planeGeometry args={[600, 600]} />
        <shaderMaterial
          vertexShader={cloudVert}
          fragmentShader={cloudFrag}
          uniforms={{ time: { value: 0 } }}
          transparent
          depthWrite={false}
        />
      </mesh>
      {plats.map((pl) => (
        <mesh key={pl.i} ref={(el) => (meshes.current[pl.i] = el)} geometry={pl.geo} material={pl.mat} />
      ))}
      {shards.map((sh, i) => (
        <mesh key={i} ref={(el) => (shardRefs.current[i] = el)} position={sh.pos} scale={sh.s}>
          <octahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial color={sh.color} roughness={0.1} metalness={0.2} iridescence={1} clearcoat={1} flatShading />
        </mesh>
      ))}

      {/* Último portal: a través de él ya se ve la playa */}
      <group position={[last[0], last[1] + 1.9, PORTAL_Z]}>
        <mesh ref={ring}>
          <torusGeometry args={[PORTAL_R + 0.08, 0.08, 16, 80]} />
          <meshStandardMaterial color="#2a1b3d" emissive="#ffd27f" emissiveIntensity={1} />
        </mesh>
        <mesh>
          <circleGeometry args={[PORTAL_R, 64]} />
          <MeshPortalMaterial resolution={1024}>
            <BeachGlimpse />
          </MeshPortalMaterial>
        </mesh>
      </group>

      <primitive object={particles.group} />
      <primitive object={lightning.group} />
      <MadnessEffects madRef={madRef} hdr />
    </>
  )
}
