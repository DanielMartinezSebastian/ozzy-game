let ctx
const ac = () => {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function noise(dur, freq, vol, type = 'lowpass') {
  const a = ac()
  const len = Math.floor(a.sampleRate * dur)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(a.destination)
  src.start()
}

function tone(f0, f1, dur, type, vol, delay = 0) {
  const a = ac()
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur)
}

// Gruñido grave: sierra modulada en amplitud a ~25 Hz
function growl(vol, dur = 1.1) {
  const a = ac()
  const t = a.currentTime
  const o = a.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(70 + Math.random() * 15, t)
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
  o.connect(am).connect(f).connect(g).connect(a.destination)
  o.start(t)
  lfo.start(t)
  o.stop(t + dur)
  lfo.stop(t + dur)
}

let ambient = false
function startAmbient() {
  if (ambient) return
  ambient = true
  const a = ac()
  const out = a.createGain()
  out.gain.value = 0.06
  const f = a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 140
  const lfo = a.createOscillator()
  lfo.frequency.value = 0.07
  const lfoG = a.createGain()
  lfoG.gain.value = 80
  lfo.connect(lfoG).connect(f.frequency)
  for (const fr of [41, 41.6, 61.7]) {
    const o = a.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = fr
    o.connect(f)
    o.start()
  }
  f.connect(out).connect(a.destination)
  lfo.start()
}

export const sfx = {
  startAmbient,
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
  win: () => [0, 0.12, 0.24].forEach((t, i) => tone(330 * (i + 1), 330 * (i + 1), 0.2, 'square', 0.1, t)),
}
