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
