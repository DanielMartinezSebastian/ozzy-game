import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createLightning } from './lightning'

// Punta del índice en coordenadas de cámara. Los niveles lanzan el rayo desde aquí,
// y como la mano se dibuja con el mismo FOV encima del juego, el rayo sale del dedo.
export const HAND_TIP = new THREE.Vector3(0.11, -0.1, -0.42)

// Mano derecha procedural, en coordenadas de modelo: dedos hacia +Z, dorso hacia +Y, pulgar en +X.
const FINGERS = [
  // x del nudillo, longitudes de falanges, radio, curvatura en reposo y al lanzar
  { x: 0.03, len: [0.044, 0.027, 0.021], r: 0.0088, rest: [0.08, 0.1, 0.06], cast: [-0.05, 0, 0] },
  { x: 0.009, len: [0.048, 0.031, 0.023], r: 0.0092, rest: [0.25, 0.3, 0.15], cast: [-0.02, 0.02, 0] },
  { x: -0.012, len: [0.045, 0.029, 0.022], r: 0.0085, rest: [0.95, 1.25, 0.6], cast: [0.3, 0.3, 0.1] },
  { x: -0.031, len: [0.035, 0.022, 0.019], r: 0.0074, rest: [1.05, 1.35, 0.7], cast: [0.45, 0.4, 0.2] },
]

function capsule(r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 8, 20)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, len / 2)
  return g
}

function buildHand(skin, nail) {
  const root = new THREE.Group()
  const joints = []
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.086, 0.03, 0.1, 6, 0.014), skin)
  root.add(palm)
  // Antebrazo y muñeca
  const wrist = new THREE.Mesh(capsule(0.027, 0.32), skin)
  wrist.rotation.y = Math.PI
  wrist.position.z = -0.03
  wrist.scale.set(1.35, 0.85, 1)
  root.add(wrist)

  let tip = null
  FINGERS.forEach((f, fi) => {
    let parent = new THREE.Group()
    parent.position.set(f.x, 0.002, 0.044)
    parent.rotation.y = (fi - 1.2) * -0.05 // abanico leve
    root.add(parent)
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(f.r * 1.15, 16, 12), skin)
    parent.add(knuckle)
    f.len.forEach((L, si) => {
      const j = new THREE.Group()
      parent.add(j)
      const r = f.r * (1 - si * 0.1)
      j.add(new THREE.Mesh(capsule(r, L), skin))
      joints.push({ j, f, si })
      const end = new THREE.Group()
      end.position.z = L
      j.add(end)
      if (si === 2) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), nail)
        n.scale.set(r * 0.85, r * 0.3, L * 0.45)
        n.position.set(0, r * 0.78, L * 0.55)
        j.add(n)
        if (fi === 0) {
          tip = new THREE.Group()
          tip.position.z = L + r
          j.add(tip)
        }
      }
      parent = end
    })
  })

  // Pulgar
  let tp = new THREE.Group()
  tp.position.set(0.04, -0.008, -0.025)
  tp.rotation.set(0.35, 0.75, -0.5)
  root.add(tp)
  ;[0.038, 0.03, 0.025].forEach((L, si) => {
    const r = 0.0115 * (1 - si * 0.12)
    const j = new THREE.Group()
    j.rotation.x = si === 0 ? 0 : 0.15
    j.rotation.y = si === 0 ? 0 : -0.15
    tp.add(j)
    j.add(new THREE.Mesh(capsule(r, L), skin))
    if (si === 2) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), nail)
      n.scale.set(r * 0.85, r * 0.3, L * 0.45)
      n.position.set(0, r * 0.8, L * 0.55)
      j.add(n)
    }
    const end = new THREE.Group()
    end.position.z = L
    j.add(end)
    tp = end
  })
  return { root, joints, tip }
}

function HandScene({ fxRef, fov }) {
  const { camera, gl, scene } = useThree()
  const holder = useRef()
  const light = useRef()
  const base = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }, [camera, fov])

  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.6
    scene.environment = env
    return () => { env.dispose(); pm.dispose() }
  }, [gl, scene])

  const { hand, skin, arcs } = useMemo(() => {
    const skin = new THREE.MeshPhysicalMaterial({
      color: '#a8684a', roughness: 0.62, sheen: 0.5, sheenColor: new THREE.Color('#c0503a'), sheenRoughness: 0.5,
      clearcoat: 0.08, clearcoatRoughness: 0.6, emissive: new THREE.Color('#58c8ff'), emissiveIntensity: 0, envMapIntensity: 0.25,
    })
    const nail = new THREE.MeshPhysicalMaterial({ color: '#d9a08c', roughness: 0.3, clearcoat: 1, envMapIntensity: 0.4 })
    return { hand: buildHand(skin, nail), skin, arcs: createLightning({ bolts: 3, branches: 1, light: false }) }
  }, [])

  // Coloca la mano para que la punta del índice caiga exactamente en HAND_TIP
  useLayoutEffect(() => {
    const g = holder.current
    g.position.set(0.24, -0.25, -0.3)
    g.lookAt(-0.02, 0.02, -1.6)
    g.rotateZ(-0.35)
    g.updateMatrixWorld(true)
    const t = hand.tip.getWorldPosition(new THREE.Vector3())
    g.position.add(HAND_TIP.clone().sub(t))
    base.copy(g.position)
  }, [hand, base])

  const st = useMemo(() => ({ cast: 0, arcT: 0, color: new THREE.Color('#7fd4ff') }), [])
  const a = useMemo(() => new THREE.Vector3(), [])
  const b = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const fx = fxRef.current
    const time = clock.elapsedTime
    // Disparo: la mano se extiende y se abre; luego vuelve
    if (fx.fire > 0) { st.cast = 1; fx.fire = 0 }
    st.cast = Math.max(0, st.cast - dt * 3.5)
    const c = st.cast
    const psy = fx.psy ?? 0
    if (psy > 0.2) st.color.setHSL((time * 0.4) % 1, 1, 0.65)
    else st.color.set(fx.color ?? '#7fd4ff')

    for (const { j, f, si } of hand.joints) j.rotation.x = THREE.MathUtils.lerp(f.rest[si], f.cast[si], Math.min(1, c * 1.6))
    const g = holder.current
    g.position.copy(base)
    g.position.y += Math.sin(time * 1.6) * 0.003
    g.position.x += Math.sin(time * 0.8) * 0.002
    // Empuje hacia delante al lanzar
    g.position.addScaledVector(HAND_TIP.clone().sub(base).normalize(), c * 0.03)

    skin.emissive.copy(st.color)
    skin.emissiveIntensity = 0.05 + c * 1.4 + (0.5 + Math.sin(time * 6) * 0.5) * 0.06
    light.current.color.copy(st.color)
    light.current.intensity = 0.15 + c * 4
    hand.tip.getWorldPosition(light.current.position)

    // Arcos eléctricos que chisporrotean entre los dedos
    st.arcT -= dt
    if (st.arcT <= 0) {
      st.arcT = c > 0 ? 0.03 : 0.25 + Math.random() * 0.9
      hand.tip.getWorldPosition(a)
      b.copy(a).add({ x: (Math.random() - 0.5) * 0.06, y: (Math.random() - 0.3) * 0.05, z: (Math.random() - 0.2) * 0.06 })
      arcs.fire(a, b, st.color, { life: 0.12, width: 0.0025 + c * 0.003, rough: 0.6 })
    }
    arcs.update(dt, camera)
  })

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[-1, 2, 1.5]} intensity={1.1} color="#ffe2c8" />
      <directionalLight position={[1.5, -0.5, -1]} intensity={0.6} color="#7fb8ff" />
      <pointLight ref={light} distance={0.6} decay={1.5} />
      <group ref={holder}>
        <primitive object={hand.root} />
      </group>
      <primitive object={arcs.group} />
    </>
  )
}

// Capa transparente encima del juego con la misma proyección que la cámara del nivel
export function HandView({ fxRef, fov }) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov, near: 0.01, far: 10, position: [0, 0, 0], rotation: [0, 0, 0] }}
      style={{ pointerEvents: 'none' }}
      events={undefined}
    >
      <HandScene fxRef={fxRef} fov={fov} />
    </Canvas>
  )
}
