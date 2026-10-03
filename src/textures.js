import * as THREE from 'three'

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const noise = (ctx, w, h, amt) => {
  const img = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amt
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

export const makeWallTexture = (bloody = true) =>
  canvasTex(64, 96, (ctx, w, h) => {
    ctx.fillStyle = '#140d0b'
    ctx.fillRect(0, 0, w, h)
    const bh = 8
    for (let row = 0; row < h / bh; row++) {
      const off = row % 2 ? 8 : 0
      for (let x = -off; x < w; x += 16) {
        const s = bloody ? 40 + Math.random() * 30 : 75 + Math.random() * 35
        ctx.fillStyle = `rgb(${s + 22},${s * 0.5},${s * 0.42})`
        ctx.fillRect(x + 1, row * bh + 1, 14, bh - 2)
      }
    }
    // Salpicaduras y chorreones de sangre
    for (let i = 0; i < (bloody ? 7 : 0); i++) {
      ctx.fillStyle = `rgba(${70 + Math.random() * 50},0,0,${0.5 + Math.random() * 0.4})`
      const x = Math.random() * w
      const y = Math.random() * h * 0.6
      ctx.fillRect(x - 3, y - 2, 6 + Math.random() * 4, 4)
      ctx.fillRect(x, y, 1 + Math.random() * 2, 10 + Math.random() * 50)
    }
    // Arañazos de garras
    if (bloody && Math.random() < 0.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      const x = 10 + Math.random() * 30
      const y = 20 + Math.random() * 40
      for (let k = 0; k < 4; k++) for (let j = 0; j < 14; j++) ctx.fillRect(x + k * 4 + j * 0.6, y + j, 1, 1)
    }
    noise(ctx, w, h, 26)
  })

export const makeFloorTexture = () =>
  canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#1e1c19'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#0e0d0c'
    ctx.fillRect(0, 0, w, 1)
    ctx.fillRect(0, 0, 1, h)
    ctx.fillRect(16, 0, 1, h)
    ctx.fillRect(0, 16, w, 1)
    ctx.fillStyle = 'rgba(80,0,0,0.5)'
    ctx.fillRect(4 + Math.random() * 20, 4 + Math.random() * 20, 5, 3)
    noise(ctx, w, h, 30)
  })

export const makeCeilTexture = () =>
  canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#0f1013'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#050505'
    ctx.fillRect(0, 0, w, 2)
    ctx.fillRect(0, 0, 2, h)
    ctx.fillStyle = '#3a2a1a'
    ctx.fillRect(12, 12, 8, 8)
    noise(ctx, w, h, 16)
  })

// Halo radial para los ojos que brillan en la oscuridad
export const makeGlowTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// Mapa de normales del agua, procedural y "tileable": suma de ondas con vectores
// de onda enteros (así el borde encaja), amplitud decreciente con la frecuencia.
export function makeWaterNormals(size = 256) {
  const waves = []
  for (let i = 0; i < 48; i++) {
    let kx, ky
    do {
      kx = Math.round((Math.random() - 0.5) * 24)
      ky = Math.round((Math.random() - 0.5) * 24)
    } while (kx === 0 && ky === 0)
    const k = Math.hypot(kx, ky)
    waves.push([kx, ky, 1 / k ** 1.4, Math.random() * Math.PI * 2])
  }
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      for (const [kx, ky, a, ph] of waves) v += a * Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph)
      h[x + y * size] = v
    }
  }
  const data = new Uint8Array(size * size * 4)
  const at = (x, y) => h[((x + size) % size) + ((y + size) % size) * size]
  const s = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * s
      const ny = (at(x, y - 1) - at(x, y + 1)) * s
      const l = Math.hypot(nx, ny, 1)
      const o = (x + y * size) * 4
      data[o] = ((nx / l) * 0.5 + 0.5) * 255
      data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255
      data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255
      data[o + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, size, size)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

// Arena: base cálida con grano fino, vetas de viento y alguna concha
export function makeSandTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#d9bf91'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 512
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '160,125,80' : '245,225,190'},0.18)`
    ctx.lineWidth = 2 + Math.random() * 5
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 6)
    ctx.stroke()
  }
  const img = ctx.getImageData(0, 0, 512, 512)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 38
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n * 0.8
  }
  ctx.putImageData(img, 0, 0)
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,245,230,0.8)' : 'rgba(120,90,60,0.6)'
    ctx.beginPath()
    ctx.ellipse(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.5, 1 + Math.random() * 1.5, Math.random() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

// Hoja de palmera: raquis central con foliolos, sobre fondo transparente
export function makePalmLeafTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 512
  const ctx = c.getContext('2d')
  ctx.strokeStyle = '#3d5a1e'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(64, 512)
  ctx.lineTo(64, 0)
  ctx.stroke()
  for (let y = 20; y < 500; y += 7) {
    const len = 58 * Math.sin((y / 512) * Math.PI) + 6
    const g = 70 + Math.random() * 50
    ctx.strokeStyle = `rgb(${40 + Math.random() * 20},${g + 40},${30})`
    ctx.lineWidth = 4
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(64, y)
      ctx.quadraticCurveTo(64 + s * len * 0.5, y - 6, 64 + s * len, y + 14)
      ctx.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
