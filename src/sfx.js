let ctx
let bus // todo el audio pasa por aquí -> distorsión -> salida
let shaper
let mad = 0 // nivel de locura 0..1
let master // volumen general, al final de la cadena
let volume = 0.7
try {
  const v = parseFloat(localStorage.getItem('maze-volume'))
  if (!Number.isNaN(v)) volume = Math.min(1, Math.max(0, v))
} catch {}

// Curva de saturación: k = 0 limpio, k alto = distorsión estridente
function curve(k) {
  const n = 1024
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return c
}

const ac = () => {
  if (!ctx) {
    ctx = new AudioContext()
    shaper = ctx.createWaveShaper()
    shaper.curve = curve(0)
    shaper.oversample = '2x'
    bus = ctx.createGain()
    master = ctx.createGain()
    master.gain.value = volume ** 2
    bus.connect(shaper).connect(master).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Con locura, cada sonido sale desafinado al azar
const dt = () => 1 + (Math.random() - 0.5) * mad * 0.9

function noise(dur, freq, vol, type = 'lowpass') {
  const a = ac()
  const len = Math.floor(a.sampleRate * dur)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  const src = a.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = dt()
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.value = freq * dt()
  const g = a.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(bus)
  src.start()
}

function tone(f0, f1, dur, type, vol, delay = 0) {
  const a = ac()
  const t = a.currentTime + delay
  const k = dt()
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0 * k, t)
  o.frequency.exponentialRampToValueAtTime(f1 * k, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(bus)
  o.start(t)
  o.stop(t + dur)
}

// Gruñido grave: sierra modulada en amplitud a ~25 Hz
function growl(vol, dur = 1.1) {
  const a = ac()
  const t = a.currentTime
  const o = a.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime((70 + Math.random() * 15) * dt(), t)
  o.frequency.linearRampToValueAtTime(55, t + dur)
  const lfo = a.createOscillator()
  lfo.frequency.value = 22 + Math.random() * 8
  const lfoGain = a.createGain()
  lfoGain.gain.value = 0.5
  const am = a.createGain()
  am.gain.value = 0.5
  lfo.connect(lfoGain).connect(am.gain)
  const f = a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 420
  const g = a.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.15)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(am).connect(f).connect(g).connect(bus)
  o.start(t)
  lfo.start(t)
  o.stop(t + dur)
  lfo.stop(t + dur)
}

let amb = null
function startAmbient() {
  if (amb) return
  const a = ac()
  // Dron grave (casi inaudible al principio)
  const drone = a.createGain()
  drone.gain.value = 0.012
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 140
  const lfo = a.createOscillator()
  lfo.frequency.value = 0.07
  const lfoG = a.createGain()
  lfoG.gain.value = 80
  lfo.connect(lfoG).connect(lp.frequency)
  lfo.start()
  for (const fr of [41, 41.6, 61.7]) {
    const o = a.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = fr
    o.connect(lp)
    o.start()
  }
  lp.connect(drone).connect(bus)

  // Capa de chirridos agudos con vibrato salvaje (crece con la locura)
  const screech = a.createGain()
  screech.gain.value = 0
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800
  bp.Q.value = 1.5
  const vibLfo = a.createOscillator()
  vibLfo.frequency.value = 3
  const vib = a.createGain()
  vib.gain.value = 20
  vibLfo.connect(vib)
  vibLfo.start()
  for (const [fr, type] of [[660, 'sawtooth'], [987, 'square'], [1397, 'sawtooth'], [1661, 'triangle']]) {
    const o = a.createOscillator()
    o.type = type
    o.frequency.value = fr
    vib.connect(o.frequency)
    o.connect(bp)
    o.start()
  }
  bp.connect(screech).connect(bus)
  amb = { drone, screech, vib, vibLfo }
}

let lastM = -1
let lastK = 0
function setMadness(m) {
  mad = m
  if (!amb || Math.abs(m - lastM) < 0.01) return
  lastM = m
  const t = ctx.currentTime
  amb.drone.gain.setTargetAtTime(0.012 + m * 0.07, t, 0.4)
  amb.screech.gain.setTargetAtTime(m * m * 0.05, t, 0.4)
  amb.vib.gain.setTargetAtTime(20 + m * 450, t, 0.4)
  amb.vibLfo.frequency.setTargetAtTime(3 + m * 15, t, 0.4)
  const k = Math.round(m * 12) * 5
  if (k !== lastK) {
    lastK = k
    shaper.curve = curve(k)
    bus.gain.setTargetAtTime(1 / (1 + k * 0.025), t, 0.1)
  }
}

function setVolume(v) {
  volume = Math.min(1, Math.max(0, v))
  try { localStorage.setItem('maze-volume', String(volume)) } catch {}
  // Curva cuadrática: el oído percibe el volumen de forma logarítmica
  if (master) master.gain.setTargetAtTime(volume ** 2, ctx.currentTime, 0.05)
}

export const sfx = {
  startAmbient,
  setVolume,
  getVolume: () => volume,
  setMadness,
  shoot: () => { noise(0.3, 1600, 0.6); tone(150, 40, 0.15, 'square', 0.15) },
  empty: () => tone(900, 700, 0.05, 'square', 0.05),
  yelp: () => tone(1100, 500, 0.18, 'sawtooth', 0.12),
  whimper: () => { tone(800, 300, 0.5, 'triangle', 0.15); tone(500, 120, 0.7, 'triangle', 0.1, 0.4) },
  bark: (vol = 0.3) => {
    noise(0.18, 700, vol * 1.5, 'bandpass')
    tone(380, 160, 0.16, 'sawtooth', vol * 0.5)
  },
  bite: () => { noise(0.12, 2500, 0.5, 'highpass'); tone(160, 60, 0.25, 'square', 0.2) },
  growl,
  heartbeat: (vol = 0.5) => {
    tone(60, 35, 0.14, 'sine', vol)
    tone(52, 30, 0.14, 'sine', vol * 0.7, 0.16)
  },
  // Chillidos aleatorios de la locura
  shriek: () => {
    const f = 1200 + Math.random() * 1800
    tone(f, f * (0.2 + Math.random() * 0.5), 0.4 + Math.random() * 0.6, Math.random() < 0.5 ? 'sawtooth' : 'square', 0.06 + mad * 0.08)
    if (Math.random() < 0.5) noise(0.5, 3000, 0.15 * mad, 'highpass')
  },
  // Risa entrecortada: pulsos rápidos de tono
  cackle: () => {
    const base = 300 + Math.random() * 400
    for (let i = 0; i < 6; i++) tone(base * 1.4, base, 0.08, 'square', 0.06 + mad * 0.06, i * 0.11)
  },
  win: () => [0, 0.12, 0.24].forEach((t, i) => tone(330 * (i + 1), 330 * (i + 1), 0.2, 'square', 0.1, t)),
}
