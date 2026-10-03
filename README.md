# Ozzy Game

Shooter en primera persona estilo retro (tipo DOOM) dentro de un laberinto 3D, hecho con React y Three.js.

## Stack

- [React 19](https://react.dev/)
- [Three.js](https://threejs.org/) vía [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) y [@react-three/drei](https://github.com/pmndrs/drei)
- [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing)
- [Vite](https://vite.dev/)

## Requisitos

- Node.js 20 o superior

## Puesta en marcha

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción en dist/
npm run preview  # previsualiza el build
```

## Controles

Haz click en la pantalla para capturar el ratón y empezar a jugar.

| Acción | Tecla |
| --- | --- |
| Moverse | `W` `A` `S` `D` / flechas |
| Mirar / girar | Ratón / `←` `→` |
| Disparar | Click izquierdo |
| Correr | `Shift` |
| Reiniciar (al terminar la partida) | `R` |
