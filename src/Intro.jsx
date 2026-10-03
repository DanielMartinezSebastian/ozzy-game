import { useEffect, useState } from 'react'

const LINES = [
  'Llevas tres noches soñando con la misma playa.',
  'En el sueño, Ozzy te espera junto al agua.',
  'Mueve la cola. Te mira. No parpadea.',
  'Su ojo azul ve lo que tú ves.\nSu ojo marrón ve lo que hay debajo.',
  'Esta mañana había una puerta en la arena.\nAyer no estaba.',
]
const QUESTION = '¿Seguro que Ozzy está bien?'

// Intro: frases que aparecen y se desvanecen, y la pregunta final.
// Click o cualquier tecla adelanta; al terminar, "Despertar" empieza el juego.
export function Intro({ onDone }) {
  const [i, setI] = useState(0)
  const total = LINES.length + 1
  const last = i >= total

  useEffect(() => {
    if (last) return
    const t = setTimeout(() => setI((n) => n + 1), i === LINES.length ? 4200 : 3400)
    return () => clearTimeout(t)
  }, [i, last])

  useEffect(() => {
    const skip = (e) => {
      if (e.code === 'Escape') return setI(total)
      setI((n) => Math.min(total, n + 1))
    }
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [total])

  return (
    <div className="intro" onClick={() => !last && setI((n) => Math.min(total, n + 1))}>
      <div className="intro-noise" />
      {!last && i < LINES.length && (
        <p key={i} className="intro-line">{LINES[i]}</p>
      )}
      {!last && i === LINES.length && (
        <p key="q" className="intro-line intro-question">{QUESTION}</p>
      )}
      {last && (
        <div className="intro-title">
          <span className="eyebrow">un sueño en tres capas</span>
          <h1>OZZY</h1>
          <p className="intro-sub">{QUESTION}</p>
          <button className="btn" onClick={onDone}>Despertar</button>
          <span className="hint">WASD para caminar · ratón para mirar · click para canalizar el rayo</span>
        </div>
      )}
      {!last && <span className="intro-skip">click para continuar · Esc para saltar</span>}
    </div>
  )
}
