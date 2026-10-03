import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshPortalMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { useKeys } from './Game'
import { useJump, useMouseLook } from './look'
import { makePalmLeafTexture, makeSandTexture, makeWallTexture, makeWaterNormals } from './textures'
import { createParticles } from './particles'
import { createLightning } from './lightning'
import { HAND_TIP } from './Hand'
import { MadnessEffects } from './Effects'
import { sfx } from './sfx'

const EYE = 1.7
const SHORE = -2 // la orilla: hacia -Z está el mar
const PORTAL = new THREE.Vector3(0, 0, 6)
const PORTAL_R = 1.6
const UP = new THREE.Vector3(0, 1, 0)

// Altura de la arena: sube tierra adentro, con dunas suaves
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b)
export function sandHeight(x, z) {
  const dunes = smooth(SHORE + 4, SHORE + 22, z)
  return (z - SHORE) * 0.07 + (Math.sin(x * 0.15) * 0.35 + Math.sin(z * 0.21 + x * 0.07) * 0.3) * dunes
}

function Sand() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(160, 120, 200, 150)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, 40)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-3, sandHeight(p.getX(i), p.getZ(i))))
    g.computeVertexNormals()
    return g
  }, [])
  const map = useMemo(() => {
    const t = makeSandTexture()
    t.repeat.set(40, 30)
    return t
  }, [])
  return (
    <mesh geometry={geo} userData={{ hit: 'sand' }}>
      <meshStandardMaterial map={map} roughness={0.95} color="#f2dcc0" />
    </mesh>
  )
}

function Palm({ x, z, h, lean, leaf }) {
  const { trunk, leaves } = useMemo(() => {
    const y0 = sandHeight(x, z) - 0.3
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean.x * 0.3, h * 0.35, lean.y * 0.3),
      new THREE.Vector3(lean.x * 0.8, h * 0.7, lean.y * 0.8),
      new THREE.Vector3(lean.x * 1.4, h, lean.y * 1.4),
    ])
    const trunk = new THREE.TubeGeometry(curve, 24, 0.17, 10)
    // Anillos del tronco: engorda un poco cada tramo
    const p = trunk.attributes.position
    const tmp = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / 11)
      const k = 1 + (ring % 2) * 0.12 - (ring / 25) * 0.3
      const c = curve.getPoint(ring / 24)
      tmp.fromBufferAttribute(p, i).sub(c).multiplyScalar(k).add(c)
      p.setXYZ(i, tmp.x, tmp.y, tmp.z)
    }
    trunk.computeVertexNormals()
    const top = curve.getPoint(1)
    const leaves = Array.from({ length: 9 }, (_, i) => {
      const g = new THREE.PlaneGeometry(1.1, 4.2, 1, 12)
      g.translate(0, 2.1, 0)
      const lp = g.attributes.position
      for (let k = 0; k < lp.count; k++) {
        const t = lp.getY(k) / 4.2
        lp.setZ(k, -t * t * 2.2) // la hoja cae por su peso
      }
      g.rotateX(-Math.PI / 2 + 0.5)
      g.rotateY((i / 9) * Math.PI * 2 + Math.random() * 0.3)
      g.translate(top.x, top.y, top.z)
      g.computeVertexNormals()
      return g
    })
    return { trunk, leaves, y0 }
  }, [x, z, h, lean])
  return (
    <group position={[x, sandHeight(x, z) - 0.3, z]}>
      <mesh geometry={trunk}>
        <meshStandardMaterial color="#7d6043" roughness={1} />
      </mesh>
      {leaves.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial map={leaf} alphaTest={0.4} side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

const PALMS = [
  { x: -12, z: 12, h: 7, lean: { x: 1.2, y: -0.8 } },
  { x: 10, z: 18, h: 8, lean: { x: -1, y: -1.2 } },
  { x: -19, z: 24, h: 6.5, lean: { x: 0.8, y: 0.4 } },
  { x: 17, z: 7, h: 7.5, lean: { x: -1.5, y: -0.6 } },
  { x: 25, z: 24, h: 8.5, lean: { x: -0.6, y: -1 } },
  { x: -6, z: 32, h: 7, lean: { x: 0.3, y: -1.4 } },
  { x: -28, z: 9, h: 6.8, lean: { x: 1.4, y: -0.3 } },
]

// Lo que se ve a través del portal: un pasillo del laberinto, rojo y vacío
function PortalInside() {
  const wall = useMemo(() => {
    const t = makeWallTexture(true)
    t.repeat.set(7, 1.5)
    return t
  }, [])
  const floor = -1.9
  return (
    <>
      <color attach="background" args={['#050000']} />
      <fog attach="fog" args={['#1a0202', 3, 18]} />
      <ambientLight intensity={1.6} color="#ff7a66" />
      <pointLight position={[0, 0.8, -2]} color="#ffb090" intensity={30} distance={10} decay={1.2} />
      <pointLight position={[0, 0.6, -8]} color="#ff2a10" intensity={40} distance={12} decay={1.2} />
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, floor + 1.6, -8]}>
          <boxGeometry args={[0.2, 3.2, 16]} />
          <meshLambertMaterial map={wall} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, floor, -8]}>
        <planeGeometry args={[2.6, 16]} />
        <meshLambertMaterial color="#1b1612" />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, floor + 3.2, -8]}>
        <planeGeometry args={[2.6, 16]} />
        <meshLambertMaterial color="#0d0d10" />
      </mesh>
    </>
  )
}

export function Beach({ ending, onHud, onFire, onEnter, gunRef, mapRef }) {
  const { camera, gl, scene } = useThree()
  const keys = useKeys()
  // En el final no te mueves: solo miras el mar mientras aparecen las frases
  useMouseLook(camera, !ending)
  const jump = useJump(sfx.jump, sfx.land, !ending)
  const madRef = useRef({ madness: 0, kick: 0, hue: 0, exposure: ending ? 0.32 : 0.42 })
  const particles = useMemo(() => createParticles(200), [])
  const lightning = useMemo(() => createLightning({ boost: 3 }), [])
  const leaf = useMemo(() => makePalmLeafTexture(), [])
  const frame = useRef()
  const swirl = useRef()


  // Atardecer en la playa; al final, el sol ya roza el horizonte
  const sun = useMemo(
    () => new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - (ending ? 5 : 16)), THREE.MathUtils.degToRad(ending ? 222 : 305)),
    [ending],
  )
  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(10000)
    const u = s.material.uniforms
    u.sunPosition.value.copy(sun)
    u.turbidity.value = ending ? 5 : 3
    u.rayleigh.value = ending ? 2.6 : 1.8
    u.mieCoefficient.value = 0.006
    u.mieDirectionalG.value = 0.88
    if (u.cloudCoverage) u.cloudCoverage.value = 0.35
    return s
  }, [sun, ending])
  const water = useMemo(() => {
    const w = new Water(new THREE.PlaneGeometry(10000, 10000), {
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: makeWaterNormals(),
      sunDirection: sun.clone(),
      sunColor: ending ? 0xffb070 : 0xffe2b0,
      waterColor: 0x0e5a6e,
      distortionScale: 2,
      fog: false,
    })
    w.material.uniforms.size.value = 1.6
    w.rotation.x = -Math.PI / 2
    w.position.y = -0.05
    w.userData.hit = 'water'
    return w
  }, [sun, ending])

  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(sky.geometry, sky.material).copy(sky, false))
    const rt = pm.fromScene(envScene)
    scene.environment = rt.texture
    return () => { rt.dispose(); pm.dispose(); scene.environment = null }
  }, [gl, scene, sky])

  const st = useRef({
    bob: 0, bobAmp: 0, cd: 0, flash: 0, entered: false, prev: new THREE.Vector3(),
  })
  const ground = (x, z) => Math.max(-0.4, sandHeight(x, z))

  const pushHud = () =>
    onHud({
      hp: 100, ammo: null, kills: 0, total: 0, status: 'playing', madness: 0,
      label: 'PUERTA', stage: ending ? 'ending' : 'beach',
    })

  useEffect(() => {
    if (ending) {
      camera.position.set(0, ground(0, 4) + EYE, 4)
      camera.lookAt(0, EYE, -20)
    } else {
      camera.position.set(0, ground(0, 18) + EYE, 18)
      camera.lookAt(PORTAL.x, ground(PORTAL.x, PORTAL.z) + 1.7, PORTAL.z)
    }
    st.current.prev.copy(camera.position)
    pushHud()
    sfx.startSea()
    if (import.meta.env.DEV) window.__beach = { camera, st }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rayos en la playa: inofensivos, solo levantan arena o agua
  useEffect(() => {
    const dir = new THREE.Vector3()
    const tip = new THREE.Vector3()
    const end = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    raycaster.far = 200
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
      const targets = [water]
      scene.traverse((o) => o.userData.hit && o !== water && targets.push(o))
      const hit = raycaster.intersectObjects(targets, false)[0]
      end.copy(hit ? hit.point : camera.position.clone().addScaledVector(dir, 80))
      lightning.fire(tip, end, ending ? '#ffd27f' : '#9fdcff', { width: 0.05 })
      particles.zap(tip, dir, '#ffd27f')
      if (hit?.object.userData.hit === 'water') { particles.splash(hit.point); sfx.splash() }
      else if (hit) particles.impactWall(hit.point, UP)
    }
    const onClick = () => { sfx.startSea() }
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

    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    if (!s.entered && !ending) {
      const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
      if (turn) camera.rotateOnWorldAxis(UP, turn * 2.4 * dt)
      right.set(-fwd.z, 0, fwd.x)
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      move.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r)
      const moving = move.lengthSq() > 0
      const run = k.ShiftLeft || k.ShiftRight
      if (moving) {
        move.normalize().multiplyScalar((run ? 7 : 4.2) * dt)
        p.x = THREE.MathUtils.clamp(p.x + move.x, -60, 60)
        p.z = THREE.MathUtils.clamp(p.z + move.z, SHORE - 3, 70)
        s.bob += dt * (run ? 12 : 9)
      }
      s.bobAmp = THREE.MathUtils.lerp(s.bobAmp, moving ? 1 : 0, dt * 8)
    }
    p.y = ground(p.x, p.z) + EYE + Math.sin(s.bob * 2) * 0.04 * s.bobAmp + jump.current.step(dt)

    // Cruzar el portal (de delante hacia atrás y por dentro del aro) lleva al laberinto
    if (!ending && !s.entered) {
      const crossed = s.prev.z > PORTAL.z && p.z <= PORTAL.z
      if (crossed && Math.abs(p.x - PORTAL.x) < PORTAL_R * 0.9) {
        s.entered = true
        sfx.portal()
        onEnter()
      }
    }
    s.prev.copy(p)

    s.cd -= dt
    s.flash = Math.max(0, s.flash - dt * 10)
    water.material.uniforms.time.value += dt * 0.5
    sky.material.uniforms.time && (sky.material.uniforms.time.value = time)
    particles.update(dt)
    lightning.update(dt, camera)

    // Portal: el aro late y la espiral gira; más intenso cuanto más cerca estás
    if (frame.current) {
      const near = 1 - THREE.MathUtils.clamp(Math.hypot(p.x - PORTAL.x, p.z - PORTAL.z) / 14, 0, 1)
      const m = frame.current.material
      m.emissiveIntensity = ending ? 0.05 : 0.6 + Math.sin(time * 3) * 0.25 + near * 0.6
      if (!ending) m.emissive.setHSL((0.55 + Math.sin(time * 0.3) * 0.12) % 1, 1, 0.5)
      if (swirl.current) {
        swirl.current.rotation.z = time * 0.8
        swirl.current.material.opacity = ending ? 0 : 0.08 + near * 0.18
      }
      madRef.current.kick = near * near * 0.25
    }

    if (gunRef.current) {
      const bx = Math.sin(s.bob) * 14 * s.bobAmp
      const by = Math.abs(Math.cos(s.bob)) * 10 * s.bobAmp + s.flash * 6
      gunRef.current.style.transform = `translate(${bx}px, ${by}px)`
    }

    // Mapa: arena, mar, portal, Ozzy y tú
    const cv = mapRef.current
    if (cv) {
      const ctx = cv.getContext('2d')
      const W = cv.width
      const sc = W / 60
      const ox = W / 2 - p.x * sc
      const oz = W / 2 - p.z * sc
      ctx.fillStyle = '#0e4a5c'
      ctx.fillRect(0, 0, W, W)
      ctx.fillStyle = '#c9ad7f'
      const shoreY = oz + SHORE * sc
      ctx.fillRect(0, Math.max(0, shoreY), W, W)
      ctx.fillStyle = '#3d6b2a'
      for (const pl of PALMS) ctx.fillRect(ox + pl.x * sc - 2, oz + pl.z * sc - 2, 4, 4)
      if (!ending) {
        ctx.fillStyle = '#a8f'
        ctx.fillRect(ox + (PORTAL.x - PORTAL_R) * sc, oz + PORTAL.z * sc - 2, PORTAL_R * 2 * sc, 4)
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

  const py = ground(PORTAL.x, PORTAL.z) + 1.9

  return (
    <>
      <primitive object={sky} />
      <primitive object={water} />
      <Sand />
      <hemisphereLight args={['#ffe8cc', '#c9a27a', 0.8]} />
      <directionalLight position={sun.clone().multiplyScalar(100)} intensity={2.2} color={ending ? '#ffb070' : '#ffe2b8'} />
      {PALMS.map((pl, i) => <Palm key={i} {...pl} leaf={leaf} />)}
      {[[-7, 3], [6, 14], [-14, 18], [13, 2]].map(([x, z], i) => (
        <mesh key={i} position={[x, sandHeight(x, z) + 0.1, z]} rotation={[i, i * 2, 0]} scale={[0.9 + i * 0.2, 0.55, 0.8]}>
          <dodecahedronGeometry args={[0.8, 1]} />
          <meshStandardMaterial color="#8a8378" roughness={0.9} flatShading />
        </mesh>
      ))}

      {/* Portal: aro de energía + ventana al laberinto (MeshPortalMaterial). Al final ya no está */}
      {!ending && <group position={[PORTAL.x, py, PORTAL.z]}>
        <mesh ref={frame}>
          <torusGeometry args={[PORTAL_R + 0.08, 0.07, 24, 96]} />
          <meshStandardMaterial color="#20142e" emissive="#8a5cff" emissiveIntensity={1.5} metalness={0.6} roughness={0.3} />
        </mesh>
        {!ending && (
          <>
            <mesh>
              <circleGeometry args={[PORTAL_R, 64]} />
              <MeshPortalMaterial resolution={1024}>
                <PortalInside />
              </MeshPortalMaterial>
            </mesh>
            <mesh ref={swirl} position-z={0.02}>
              <ringGeometry args={[PORTAL_R * 0.92, PORTAL_R + 0.02, 64, 1, 0, Math.PI * 1.2]} />
              <meshBasicMaterial color="#c9a8ff" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          </>
        )}
      </group>}

      <primitive object={particles.group} />
      <primitive object={lightning.group} />
      <MadnessEffects madRef={madRef} hdr />
    </>
  )
}
