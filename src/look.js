import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Mirar con el ratón mientras el puntero está capturado (en document.body, desde App).
// A diferencia de PointerLockControls, el bloqueo sobrevive a los cambios de nivel:
// así se pasa de un nivel a otro sin pantallas intermedias.
const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const SENS = 0.0022
const LIMIT = Math.PI / 2 - 0.05

export function useMouseLook(camera, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onMove = (e) => {
      if (!document.pointerLockElement) return
      euler.setFromQuaternion(camera.quaternion)
      euler.y -= e.movementX * SENS
      euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * SENS, -LIMIT, LIMIT)
      camera.quaternion.setFromEuler(euler)
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [camera, enabled])
}

// Salto sencillo para los niveles sin plataformas: solo desplaza la altura de la cámara.
// (El ascenso tiene su propia física, con plataformas y caídas.)
const JUMP_V = 6.5
const JUMP_G = 20

export function useJump(onJump, onLand, enabled = true) {
  const j = useRef({ y: 0, vy: 0 })
  useEffect(() => {
    const onKey = (e) => {
      if (!enabled || e.code !== 'Space' || !document.pointerLockElement) return
      e.preventDefault()
      if (j.current.y > 0.001 || j.current.vy > 0) return
      j.current.vy = JUMP_V
      onJump?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onJump, enabled])
  // Avanza el salto y devuelve la altura extra de la cámara
  j.current.step ??= (dt) => {
    const s = j.current
    if (s.y <= 0 && s.vy <= 0) return 0
    s.vy -= JUMP_G * dt
    s.y += s.vy * dt
    if (s.y <= 0) { s.y = 0; s.vy = 0; onLand?.() }
    return s.y
  }
  return j
}
