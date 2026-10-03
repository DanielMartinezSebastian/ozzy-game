import * as THREE from 'three'

// Coordenadas normalizadas (u, v desde arriba-izquierda) de rasgos en dog.png
// Heterocromía: ojo izquierdo marrón, derecho azul (como en la foto)
const EYES = [
  { u: 0.338, v: 0.331, core: '#ffd9a0', iris: '#a0521a', glow: '#ff8a2a' },
  { u: 0.494, v: 0.292, core: '#e6fbff', iris: '#2f9dff', glow: '#5fd0ff' },
]
const NOSE = [0.43, 0.395]
const MOUTH = [0.45, 0.49]

const TEX = 512 // resolución de la textura
const SEG = 110 // subdivisiones de la malla

export const DOG_SIZE = 1.7

// Fondo negro -> transparente con flood fill desde los bordes
// (así no se come el pelo oscuro del lomo, que no conecta con el borde).
function cutout(data, w, h) {
  const bg = new Uint8Array(w * h)
  const isDark = (i) => {
    const o = i * 4
    return data[o + 3] < 20 || data[o] + data[o + 1] + data[o + 2] < 50
  }
  const stack = []
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w)
  for (let y = 0; y < h; y++) stack.push(y * w, w - 1 + y * w)
  while (stack.length) {
    const i = stack.pop()
    if (bg[i] || !isDark(i)) continue
    bg[i] = 1
    const x = i % w
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < w * (h - 1)) stack.push(i + w)
  }
  return bg
}

// Distancia aproximada al borde de la silueta (chamfer de 2 pasadas)
function distanceField(mask, w, h) {
  const d = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 1e9 : 0
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[x + y * w])
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = x + y * w
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414)
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = x + y * w
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414)
    }
  return d
}

const gauss = (u, v, [cu, cv], r) => Math.exp(-((u - cu) ** 2 + (v - cv) ** 2) / (r * r))

export function buildDog(image) {
  // --- Textura tenebrosa ---
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const ctx = c.getContext('2d')
  ctx.drawImage(image, 0, 0, TEX, TEX)
  const img = ctx.getImageData(0, 0, TEX, TEX)
  const p = img.data
  const bg = cutout(p, TEX, TEX)
  for (let i = 0; i < TEX * TEX; i++) {
    const o = i * 4
    if (bg[i]) { p[o + 3] = 0; continue }
    const lum = 0.3 * p[o] + 0.59 * p[o + 1] + 0.11 * p[o + 2]
    // Desaturar, oscurecer, más contraste y tinte rojizo enfermizo
    const k = (v) => Math.max(0, Math.min(255, ((v * 0.35 + lum * 0.65) / 255 - 0.5) * 1.5 * 255 + 128 - 40))
    p[o] = k(p[o]) * 1.05
    p[o + 1] = k(p[o + 1]) * 0.8
    p[o + 2] = k(p[o + 2]) * 0.75
    p[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  // Boca ensangrentada + babas de sangre
  ctx.globalCompositeOperation = 'source-atop'
  const [mx, my] = [MOUTH[0] * TEX, MOUTH[1] * TEX]
  const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 34)
  mg.addColorStop(0, 'rgba(140,0,0,0.85)')
  mg.addColorStop(1, 'rgba(90,0,0,0)')
  ctx.fillStyle = mg
  ctx.fillRect(mx - 40, my - 40, 80, 80)
  ctx.fillStyle = 'rgba(120,0,0,0.9)'
  for (let i = 0; i < 6; i++) {
    const x = mx - 22 + Math.random() * 44
    ctx.fillRect(x, my + 6, 2 + Math.random() * 2, 15 + Math.random() * 45)
  }
  // Ojos: cuencas negras con iris brillante (uno marrón, otro azul)
  for (const { u, v, core, iris } of EYES) {
    const ex = u * TEX
    const ey = v * TEX
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(ex, ey, 13, 0, Math.PI * 2)
    ctx.fill()
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 11)
    eg.addColorStop(0, core)
    eg.addColorStop(0.35, iris)
    eg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = eg
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter // look retro pixelado

  // --- Malla "inflada" a partir de la silueta ---
  const N = SEG + 1
  const mask = new Uint8Array(N * N)
  const alphaAt = (u, v) => p[(Math.min(TEX - 1, Math.floor(v * TEX)) * TEX + Math.min(TEX - 1, Math.floor(u * TEX))) * 4 + 3]
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) mask[x + y * N] = alphaAt(x / SEG, y / SEG) > 0 ? 1 : 0
  const dist = distanceField(mask, N, N)
  let maxD = 0
  for (const v of dist) maxD = Math.max(maxD, v)

  const depthAt = (u, v, i) => {
    if (!mask[i]) return 0
    let z = Math.sqrt(dist[i] / maxD) * 0.45 // cuerpo abombado
    z += gauss(u, v, NOSE, 0.07) * 0.32 // hocico
    z += gauss(u, v, MOUTH, 0.06) * 0.12
    z += gauss(u, v, [0.42, 0.36], 0.16) * 0.12 // cabeza
    return z * DOG_SIZE * 0.5
  }

  const geometry = new THREE.PlaneGeometry(DOG_SIZE, DOG_SIZE, SEG, SEG)
  const pos = geometry.attributes.position
  // PlaneGeometry ordena los vértices fila a fila empezando por arriba (v = 0)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = x + y * N
      pos.setZ(i, depthAt(x / SEG, y / SEG, i))
    }
  geometry.computeVertexNormals()

  const eyes = EYES.map(({ u, v, glow }) => {
    const i = Math.round(u * SEG) + Math.round(v * SEG) * N
    return { pos: new THREE.Vector3((u - 0.5) * DOG_SIZE, (0.5 - v) * DOG_SIZE, depthAt(u, v, i) + 0.03), color: glow }
  })

  return { texture, geometry, eyes }
}
