import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SNOISE } from './deform'

// Escaneo 3D de cabeza "Infinite" de Lee Perry-Smith (CC BY 3.0, ver README)
const BASE = '/models/head/'

// uPsy: viaje psicodélico (deforma la malla y la tiñe de arcoíris)
// uHurt: destello de dolor · uBlood: heridas con poca vida · uDead: palidez
function makeHeadMaterial(map, normalMap) {
  const uniforms = {
    uTime: { value: 0 }, uPsy: { value: 0 }, uHurt: { value: 0 }, uBlood: { value: 0 }, uDead: { value: 0 },
  }
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.6, metalness: 0 })
  mat.normalScale.set(0.9, 0.9)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    const head = `
uniform float uTime;
uniform float uPsy;
uniform float uHurt;
uniform float uBlood;
uniform float uDead;
varying vec2 vPsyUv;
${SNOISE}`
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vPsyUv = uv;
{
  float n = snoise(position * 0.45 + vec3(0.0, uTime * 0.9, 0.0));
  float wave = sin(position.y * 1.6 - uTime * 5.0);
  transformed += normal * (n * 0.45 + wave * 0.18) * uPsy;
  // Derretirse: la mitad inferior cae y se ondula
  transformed.y -= max(0.0, -position.y) * 0.12 * uPsy * (1.0 + sin(uTime * 2.0 + position.x));
  transformed.x += sin(position.y * 0.8 + uTime * 3.0) * 0.35 * uPsy;
}`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (vPsyUv.y * 2.0 + vPsyUv.x + uTime * 0.45 + vec3(0.0, 0.33, 0.67)));
  float bands = smoothstep(0.35, 0.65, sin(vPsyUv.y * 50.0 - uTime * 7.0 + snoise(vec3(vPsyUv * 6.0, uTime * 0.3)) * 4.0) * 0.5 + 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * rainbow * 1.6 + rainbow * bands * 0.25, uPsy * 0.85);
  float spl = smoothstep(0.55, 0.8, snoise(vec3(vPsyUv * 9.0, 3.1)) * 0.5 + 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.01, 0.01), spl * uBlood);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.02, 0.02), uHurt * 0.55);
  float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l * 0.8, l * 0.85, l), uDead * 0.8);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 rb = 0.5 + 0.5 * cos(6.28318 * (vPsyUv.y * 3.0 - uTime * 0.6 + vec3(0.0, 0.33, 0.67)));
  float stripes = smoothstep(0.75, 1.0, sin(vPsyUv.x * 40.0 + vPsyUv.y * 30.0 + uTime * 6.0) * 0.5 + 0.5);
  totalEmissiveRadiance += rb * stripes * uPsy * 0.6;
}`,
      )
  }
  mat.customProgramCacheKey = () => 'psy-head-v1'
  mat.userData.uniforms = uniforms
  return mat
}

// Ojo: esfera con esclerótica, iris y pupila pintados en la textura. En la esfera de three.js
// el punto u = 0.25, v = 0.5 mira hacia +Z, así que el iris se dibuja ahí.
function makeEyeTexture(iris) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f1ece6'
  ctx.fillRect(0, 0, 256, 128)
  // Venillas
  ctx.strokeStyle = 'rgba(190,60,60,0.35)'
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = 0.6 + Math.random()
    ctx.beginPath()
    let x = 64 + (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 30)
    let y = 64 + (Math.random() - 0.5) * 50
    ctx.moveTo(x, y)
    for (let k = 0; k < 4; k++) { x += (64 - x) * 0.25 + (Math.random() - 0.5) * 8; y += (64 - y) * 0.25 + (Math.random() - 0.5) * 8; ctx.lineTo(x, y) }
    ctx.stroke()
  }
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 19)
  g.addColorStop(0, '#000')
  g.addColorStop(0.32, '#000')
  g.addColorStop(0.36, iris[0])
  g.addColorStop(0.8, iris[1])
  g.addColorStop(1, '#111')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(64, 64, 19, 0, Math.PI * 2)
  ctx.fill()
  // Fibras del iris
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  for (let a = 0; a < Math.PI * 2; a += 0.25) {
    ctx.beginPath()
    ctx.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8)
    ctx.lineTo(64 + Math.cos(a) * 17, 64 + Math.sin(a) * 17)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Posición de las cuencas en coordenadas de la malla (medida sobre el escaneo)
const EYES = [
  { x: -0.72, iris: ['#7a4a1c', '#3a200b'] }, // marrón, como un ojo de Ozzy
  { x: 0.48, iris: ['#6fc4ff', '#1f5d9a'] }, // azul, como el otro
]
const EYE_Y = 1.72
const EYE_Z = 1.83
const EYE_R = 0.185

function Head({ fxRef, hp, psy, dead }) {
  const gltf = useLoader(GLTFLoader, `${BASE}LeePerrySmith.glb`)
  const [map, normalMap] = useLoader(THREE.TextureLoader, [`${BASE}Map-COL.jpg`, `${BASE}Infinite-Level_02_Tangent_SmoothUV.jpg`])
  const group = useRef()
  const eyeRefs = useRef([])
  const eyeMats = useMemo(
    () =>
      EYES.map((e) => new THREE.MeshPhysicalMaterial({
        map: makeEyeTexture(e.iris), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02,
        emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
      })),
    [],
  )
  const key = useRef()
  const rim = useRef()

  const { geometry, material } = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    let geometry
    gltf.scene.traverse((o) => { if (o.isMesh && !geometry) geometry = o.geometry })
    return { geometry, material: makeHeadMaterial(map, normalMap) }
  }, [gltf, map, normalMap])
  useEffect(() => () => material.dispose(), [material])

  // Miradas al estilo DOOM: la cara mira a un lado y a otro de vez en cuando
  const st = useMemo(() => ({ look: 0, lookT: 2, yaw: 0, hurt: 0, kick: 0, jerk: 0, psy: 0 }), [])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const time = clock.elapsedTime
    const fx = fxRef.current
    if (fx.hurt > 0) { st.hurt = 1; st.jerk = (Math.random() < 0.5 ? -1 : 1) * 0.6; fx.hurt = 0 }
    if (fx.faceKick > 0) { st.kick = 1; fx.faceKick = 0 }
    st.hurt = Math.max(0, st.hurt - dt * 2)
    st.kick = Math.max(0, st.kick - dt * 0.7)
    st.jerk *= Math.max(0, 1 - dt * 4)

    st.lookT -= dt
    if (st.lookT <= 0) {
      st.lookT = 1.2 + Math.random() * 2.5
      st.look = [-0.55, 0, 0, 0.55][Math.floor(Math.random() * 4)]
    }
    st.yaw += (st.look - st.yaw) * Math.min(1, dt * 10)
    // La psicodelia llega con la locura y en picos con cada golpe
    const target = Math.min(1, psy + st.kick * 0.8)
    st.psy += (target - st.psy) * Math.min(1, dt * 3)
    const p = st.psy

    const u = material.userData.uniforms
    u.uTime.value = time
    u.uPsy.value = p
    u.uHurt.value = st.hurt
    u.uBlood.value = THREE.MathUtils.clamp((70 - hp) / 60, 0, 1)
    u.uDead.value = dead ? 1 : 0

    const g = group.current
    if (dead) {
      g.rotation.set(0.35, 0, 0.6)
    } else {
      g.rotation.set(
        Math.sin(time * 2.2) * 0.25 * p,
        st.yaw + st.jerk + Math.sin(time * 1.3) * 0.4 * p,
        Math.sin(time * 3.1) * 0.3 * p + st.jerk * 0.3,
      )
    }
    g.scale.setScalar(1 + Math.sin(time * 8) * 0.04 * p)

    // Ojos: miran hacia donde gira la cara; muerto, en blanco; en pleno viaje giran
    // descontrolados y el iris se enciende con colores imposibles
    eyeRefs.current.forEach((eye, i) => {
      if (!eye) return
      if (dead) eye.rotation.set(-1.2, 0, 0)
      else if (p > 0.3) eye.rotation.set(Math.sin(time * 5 + i * 2) * 0.6 * p, time * 4 * p * (i ? 1 : -1), 0)
      else eye.rotation.set(Math.sin(time * 0.7) * 0.05, st.look * 0.5 + st.jerk * 0.5, 0)
      const m = eyeMats[i]
      m.emissiveIntensity = p * 0.9 + st.hurt * 0.3
      if (p > 0.15) m.emissive.setHSL((time * 0.5 + i * 0.5) % 1, 1, 0.5)
      else m.emissive.set(st.hurt > 0.2 ? '#ff2020' : '#000000')
    })

    // Luces: cálidas en calma, girando por todo el espectro en pleno viaje
    if (p > 0.15) {
      key.current.color.setHSL((time * 0.35) % 1, 1, 0.6)
      rim.current.color.setHSL((time * 0.35 + 0.5) % 1, 1, 0.6)
    } else {
      key.current.color.set('#ffe6cc')
      rim.current.color.set(st.hurt > 0.2 ? '#ff2020' : '#6fb6ff')
    }
    rim.current.intensity = 2.5 + p * 4 + st.hurt * 6
  })

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight ref={key} position={[-3, 4, 8]} intensity={2.4} />
      <directionalLight ref={rim} position={[6, 2, -4]} />
      <group ref={group}>
        <mesh geometry={geometry} material={material} />
        {EYES.map((e, i) => (
          <mesh key={i} ref={(el) => (eyeRefs.current[i] = el)} position={[e.x, EYE_Y, EYE_Z]} material={eyeMats[i]}>
            <sphereGeometry args={[EYE_R, 32, 24]} />
          </mesh>
        ))}
      </group>
    </>
  )
}

export function FaceView(props) {
  return (
    <Canvas dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ fov: 24, position: [0, 0.4, 20] }}>
      <Suspense fallback={null}>
        <Head {...props} />
      </Suspense>
    </Canvas>
  )
}
