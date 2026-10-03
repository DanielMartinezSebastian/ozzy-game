import * as THREE from 'three'

function makeSmokeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  // Varias manchas suaves superpuestas = bocanada irregular
  for (let i = 0; i < 9; i++) {
    const x = 20 + Math.random() * 24
    const y = 20 + Math.random() * 24
    const r = 10 + Math.random() * 14
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  }
  return new THREE.CanvasTexture(c)
}

function makeDotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 16, 16)
  return new THREE.CanvasTexture(c)
}

const KINDS = {
  // vida, tamaño inicial/final, opacidad, arrastre, gravedad, mezcla
  smoke: { life: [1.2, 2.2], size: [0.08, 0.7], alpha: 0.4, drag: 2.5, grav: 0.35, additive: false, tex: 'smoke' },
  flash: { life: [0.05, 0.08], size: [0.15, 0.25], alpha: 0.8, drag: 0, grav: 0, additive: true, tex: 'smoke' },
  spark: { life: [0.2, 0.5], size: [0.035, 0.01], alpha: 1, drag: 1, grav: -9, additive: true, tex: 'dot' },
  dust: { life: [0.6, 1.2], size: [0.1, 0.5], alpha: 0.5, drag: 3, grav: 0.15, additive: false, tex: 'smoke' },
  blood: { life: [0.4, 0.8], size: [0.06, 0.03], alpha: 1, drag: 0.8, grav: -7, additive: false, tex: 'dot' },
}

export function createParticles(max = 220) {
  const tex = { smoke: makeSmokeTexture(), dot: makeDotTexture() }
  const group = new THREE.Group()
  const pool = []
  for (let i = 0; i < max; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex.smoke, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.visible = false
    sprite.renderOrder = 10
    group.add(sprite)
    pool.push({ sprite, mat, vel: new THREE.Vector3(), age: 0, life: 0, kind: null, spin: 0 })
  }
  let next = 0

  function spawn(kind, pos, vel, color = '#ffffff') {
    const k = KINDS[kind]
    const p = pool[next]
    next = (next + 1) % max
    p.kind = k
    p.age = 0
    p.life = k.life[0] + Math.random() * (k.life[1] - k.life[0])
    p.vel.copy(vel)
    p.spin = (Math.random() - 0.5) * 3
    p.sprite.position.copy(pos)
    p.sprite.visible = true
    p.mat.map = tex[k.tex]
    p.mat.blending = k.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    p.mat.color.set(color)
    p.mat.rotation = Math.random() * Math.PI * 2
    p.mat.needsUpdate = true
  }

  const v = new THREE.Vector3()
  const rnd = (s) => (Math.random() - 0.5) * s

  // Disparo: fogonazo + chispas + humo que sale del cañón y sube
  function muzzle(pos, dir, madness) {
    spawn('flash', pos, v.set(0, 0, 0), '#ffcc66')
    for (let i = 0; i < 6; i++) {
      v.copy(dir).multiplyScalar(4 + Math.random() * 4).add({ x: rnd(2), y: rnd(2) + 0.5, z: rnd(2) })
      spawn('spark', pos, v, '#ffb040')
    }
    for (let i = 0; i < 7; i++) {
      v.copy(dir).multiplyScalar(0.6 + Math.random() * 1.6).add({ x: rnd(0.3), y: 0.15 + Math.random() * 0.3, z: rnd(0.3) })
      const color = madness > 0.55 && Math.random() < madness
        ? new THREE.Color().setHSL(Math.random(), 1, 0.6)
        : new THREE.Color().setScalar(0.55 + Math.random() * 0.25)
      spawn('smoke', pos, v, color)
    }
  }

  function impactWall(pos, normal) {
    for (let i = 0; i < 5; i++) spawn('dust', pos, v.copy(normal).multiplyScalar(0.8 + Math.random()).add({ x: rnd(0.6), y: rnd(0.6), z: rnd(0.6) }), '#8a7a6a')
    for (let i = 0; i < 6; i++) spawn('spark', pos, v.copy(normal).multiplyScalar(2 + Math.random() * 3).add({ x: rnd(3), y: Math.random() * 3, z: rnd(3) }), '#ffd080')
  }

  function impactFlesh(pos, toward, madness) {
    for (let i = 0; i < 14; i++) {
      v.copy(toward).multiplyScalar(1 + Math.random() * 2).add({ x: rnd(3), y: Math.random() * 3, z: rnd(3) })
      const color = madness > 0.6 && Math.random() < madness ? new THREE.Color().setHSL(Math.random(), 1, 0.5) : '#8a0000'
      spawn('blood', pos, v, color)
    }
    spawn('dust', pos, v.set(0, 0.3, 0), '#5a0000')
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.sprite.visible) continue
      p.age += dt
      const t = p.age / p.life
      if (t >= 1) { p.sprite.visible = false; continue }
      const k = p.kind
      p.vel.multiplyScalar(Math.max(0, 1 - k.drag * dt))
      p.vel.y += k.grav * dt
      p.sprite.position.addScaledVector(p.vel, dt)
      const s = k.size[0] + (k.size[1] - k.size[0]) * (1 - (1 - t) ** 2)
      p.sprite.scale.setScalar(s)
      p.mat.rotation += p.spin * dt
      p.mat.opacity = k.alpha * (1 - t) * (k.tex === 'smoke' && !k.additive && t < 0.1 ? t * 10 : 1)
    }
  }

  return { group, update, muzzle, impactWall, impactFlesh }
}
