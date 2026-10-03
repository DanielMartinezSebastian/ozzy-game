# Ozzy

Shooter onírico en primera persona hecho con React y Three.js. *¿Seguro que Ozzy está bien?*

1. **Intro**: un mensaje que no termina de tranquilizar.
2. **La playa**: arena, palmeras y un mar con reflejos en tiempo real. En la arena hay una puerta (un portal hecho con `MeshPortalMaterial` de drei) a través de la cual ya se ve el laberinto. Crúzala.
3. **El laberinto**: perros que se vuelven bestias y una barra de locura que crece con cada uno que eliminas. La salida es otro portal, por el que ya se ve el mar.
4. **El mar de cristal**: caminas sobre el agua. Cada rayo que impacta deforma una de las seis figuras flotantes y transforma el mundo (cielo, sol, oleaje y monolitos que emergen del agua).
5. **El ascenso**: plataformas suspendidas sobre un mar de nubes, algunas en movimiento. Salta de una a otra hasta el último portal. Si caes, vuelves a la última plataforma fija que pisaste.
6. **La playa, otra vez**: ¿fue un sueño?

Entre niveles no hay pantallas: el ratón sigue capturado y se pasa de uno a otro con un destello.

No hay pistola: tu mano lanza rayos eléctricos hacia el objetivo, que se resuelve con un `THREE.Raycaster`. En el HUD, una cabeza 3D realista al estilo DOOM (con un ojo marrón y otro azul) reacciona al daño y se vuelve psicodélica con la locura.

Para probar una fase concreta: `?nivel=playa`, `?nivel=1`, `?nivel=2`, `?nivel=3` o `?nivel=final`.

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
| Lanzar rayo | Click izquierdo |
| Correr | `Shift` |
| Saltar | `Espacio` |
| Silenciar / bajar / subir volumen | `M` / `-` / `+` |
| Reintentar (al morir) / volver a soñar (al final) | `R` |

## Créditos

- Cabeza del HUD: *Infinite, 3D Head Scan* de Lee Perry-Smith, con licencia [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). Basado en un trabajo de www.triplegangers.com. Ficheros obtenidos de los ejemplos de [three.js](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/LeePerrySmith). Ver `public/models/head/LeePerrySmith_License.txt`.
- Ruido simplex 3D en GLSL: Ashima Arts / Ian McEwan (MIT).
