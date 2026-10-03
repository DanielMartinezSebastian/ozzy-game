import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

// Todo el "viaje" en un único shader: ondas, zoom que respira, caleidoscopio,
// glitch por franjas, aberración cromática, rotación de tono y paleta ácida.
const fragment = /* glsl */ `
uniform float amount;
uniform float time;
uniform float kick;

vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
float hash(float n) { return fract(sin(n) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float a = amount;
  float w = a * a;

  vec2 p = uv + w * 0.025 * vec2(sin(uv.y * 18.0 + time * 3.0), cos(uv.x * 14.0 + time * 2.2));
  vec2 c = p - 0.5;
  c *= 1.0 - w * 0.06 * sin(time * 1.7) - kick * 0.08;

  float kal = smoothstep(0.7, 1.0, a);
  if (kal > 0.0) {
    float r = length(c);
    float ang = atan(c.y, c.x) + time * 0.25;
    float seg = 6.28318 / 6.0;
    float ka = abs(mod(ang, seg) - seg * 0.5);
    c = mix(c, vec2(cos(ka), sin(ka)) * r, kal);
  }
  p = c + 0.5;

  float g = step(0.4, a) * step(1.0 - 0.15 * a, hash(floor(uv.y * 40.0) + floor(time * 12.0)));
  p.x += g * (hash(floor(time * 20.0) + uv.y) - 0.5) * 0.12 * a;

  vec2 off = c * (0.003 + w * 0.035 + kick * 0.03);
  vec3 col;
  col.r = texture2D(inputBuffer, p + off).r;
  col.g = texture2D(inputBuffer, p).g;
  col.b = texture2D(inputBuffer, p - off).b;

  col = hueShift(col, w * time * 2.0);
  // Paleta ácida que conserva la forma (depende de luminancia + posición)
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 pal = 0.5 + 0.5 * cos(6.28318 * (l * 1.5 + uv.x * 0.6 + uv.y * 0.4 + time * 0.4 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, pal * (0.15 + l * 1.6), smoothstep(0.5, 1.0, a) * 0.55);
  l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.0 + a * 0.8);
  col = mix(col, 1.0 - col, step(0.85, kick) * step(0.45, a));

  outputColor = vec4(col, inputColor.a);
}
`

class PsychedelicEffect extends Effect {
  constructor() {
    super('PsychedelicEffect', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ['amount', new Uniform(0)],
        ['time', new Uniform(0)],
        ['kick', new Uniform(0)],
      ]),
    })
  }
}

// madRef.current = { madness, kick } (0..1), lo escribe Game cada frame
export function MadnessEffects({ madRef }) {
  const psych = useMemo(() => new PsychedelicEffect(), [])
  const bloom = useRef()
  const noise = useRef()
  const vignette = useRef()

  useFrame(({ clock }) => {
    const { madness: m, kick } = madRef.current
    psych.uniforms.get('amount').value = m
    psych.uniforms.get('time').value = clock.elapsedTime
    psych.uniforms.get('kick').value = kick
    if (bloom.current) bloom.current.intensity = 0.3 + m * 1.2 + kick * 0.8
    if (noise.current) noise.current.blendMode.opacity.value = 0.04 + m * 0.35
    if (vignette.current) vignette.current.darkness = 0.35 + m * 0.45
  })

  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} luminanceThreshold={0.7} mipmapBlur intensity={0.3} />
      <primitive object={psych} />
      <Noise ref={noise} blendFunction={BlendFunction.OVERLAY} opacity={0.04} />
      <Vignette ref={vignette} offset={0.3} darkness={0.35} />
    </EffectComposer>
  )
}
