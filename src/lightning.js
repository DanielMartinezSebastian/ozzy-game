import * as THREE from 'three'

// Rayos eléctricos: polilíneas quebradas (desplazamiento del punto medio) dibujadas como
// cintas orientadas a cámara. El shader pinta un núcleo blanco y un halo de color (aditivo).

const LEVELS = 5 // 2^5 segmentos por trazo
const MAX_PTS = 2 ** LEVELS + 1

const vert = /* glsl */ `
attribute float across;
varying float vAcross;
void main() {
  vAcross = across;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const frag = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float boost;
varying float vAcross;
void main() {
  float d = abs(vAcross);
  float core = smoothstep(0.28, 0.0, d);
  float glow = pow(1.0 - d, 3.0);
  vec3 c = color * glow * 1.4 + vec3(1.0) * core * 1.6;
  gl_FragColor = vec4(c * opacity * boost, 1.0);
}`

function makeStrand(boost) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PTS * 2 * 3), 3))
  const across = new Float32Array(MAX_PTS * 2)
  for (let i = 0; i < MAX_PTS; i++) { across[i * 2] = -1; across[i * 2 + 1] = 1 }
  g.setAttribute('across', new THREE.BufferAttribute(across, 1))
  const idx = []
  for (let i = 0; i < MAX_PTS - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  g.setIndex(idx)
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, opacity: { value: 0 }, boost: { value: boost } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(g, m)
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.renderOrder = 20
  return { mesh, pts: Array.from({ length: MAX_PTS }, () => new THREE.Vector3()), a: new THREE.Vector3(), b: new THREE.Vector3(), width: 0.05 }
}

const tmp = new THREE.Vector3()
const perp = new THREE.Vector3()

// Rellena pts con un camino quebrado de a a b
function jag(s, rough) {
  const { pts, a, b } = s
  const n = MAX_PTS - 1
  pts[0].copy(a)
  pts[n].copy(b)
  for (let step = n; step > 1; step /= 2) {
    const half = step / 2
    for (let i = half; i < n; i += step) {
      const p0 = pts[i - half]
      const p1 = pts[i + half]
      const len = p0.distanceTo(p1)
      tmp.subVectors(p1, p0).normalize()
      perp.randomDirection()
      perp.addScaledVector(tmp, -perp.dot(tmp)).normalize()
      pts[i].addVectors(p0, p1).multiplyScalar(0.5).addScaledVector(perp, (Math.random() - 0.5) * len * rough)
    }
  }
}

const tan = new THREE.Vector3()
const view = new THREE.Vector3()
const side = new THREE.Vector3()
function writeRibbon(s, camPos) {
  const pos = s.mesh.geometry.attributes.position
  const n = MAX_PTS
  for (let i = 0; i < n; i++) {
    const p = s.pts[i]
    tan.subVectors(s.pts[Math.min(n - 1, i + 1)], s.pts[Math.max(0, i - 1)])
    view.subVectors(camPos, p)
    side.crossVectors(tan, view).normalize()
    // Se afina hacia la punta
    const w = s.width * (1 - (i / (n - 1)) * 0.6)
    pos.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w)
    pos.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w)
  }
  pos.needsUpdate = true
}

export function createLightning({ bolts = 4, branches = 3, boost = 1, light = true } = {}) {
  const group = new THREE.Group()
  const pool = Array.from({ length: bolts }, () => {
    const strands = Array.from({ length: 1 + branches }, () => makeStrand(boost))
    strands.forEach((s) => group.add(s.mesh))
    return { strands, t: 1, life: 0.2, reseed: 0, color: new THREE.Color(), main: 0.05, rough: 0.35 }
  })
  const flash = light ? new THREE.PointLight('#9fdcff', 0, 7, 1.2) : null
  if (flash) group.add(flash)
  let next = 0

  function seed(bolt) {
    const [main, ...rest] = bolt.strands
    jag(main, bolt.rough)
    for (const br of rest) {
      // Rama: sale de un punto del trazo principal hacia un lado
      const k = 4 + Math.floor(Math.random() * (MAX_PTS - 10))
      br.a.copy(main.pts[k])
      const len = main.a.distanceTo(main.b) * (0.12 + Math.random() * 0.2)
      tmp.subVectors(main.b, main.a).normalize()
      perp.randomDirection().multiplyScalar(0.8).add(tmp).normalize()
      br.b.copy(br.a).addScaledVector(perp, len)
      jag(br, bolt.rough * 1.2)
    }
  }

  // Lanza un rayo de a a b
  function fire(a, b, color = '#9fdcff', { life = 0.22, width = 0.05, rough = 0.35 } = {}) {
    const bolt = pool[next]
    next = (next + 1) % pool.length
    bolt.t = 0
    bolt.life = life
    bolt.reseed = 0
    bolt.rough = rough
    bolt.color.set(color)
    const [main, ...rest] = bolt.strands
    main.a.copy(a)
    main.b.copy(b)
    main.width = width
    for (const br of rest) br.width = width * 0.5
    seed(bolt)
    if (flash) {
      flash.position.copy(b)
      flash.color.copy(bolt.color)
      flash.intensity = 12
    }
  }

  function update(dt, camera) {
    if (flash) flash.intensity = Math.max(0, flash.intensity - dt * 70)
    for (const bolt of pool) {
      const alive = bolt.t < 1
      if (alive) {
        bolt.t += dt / bolt.life
        bolt.reseed -= dt
        // Chisporroteo: el camino cambia varias veces durante su vida
        if (bolt.reseed <= 0) { bolt.reseed = 0.035; seed(bolt) }
      }
      const op = alive ? (1 - bolt.t) * (0.6 + Math.random() * 0.4) : 0
      bolt.strands.forEach((s, i) => {
        s.mesh.visible = alive
        if (!alive) return
        writeRibbon(s, camera.position)
        s.mesh.material.uniforms.color.value.copy(bolt.color)
        s.mesh.material.uniforms.opacity.value = op * (i === 0 ? 1 : 0.7)
      })
    }
  }

  return { group, fire, update }
}
