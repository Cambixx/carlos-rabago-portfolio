# Portfolio de Carlos Rábago

Sala 3D navegable (Three.js) con boot screen, escritorio de proyectos y paneles de
experiencia, sobre mí y contacto. Hay una versión plana (sin WebGL) con los mismos paneles.

## Verlo en local

Necesitas Node 20.19+ o 22.12+ (`node -v`).

```sh
npm install        # solo la primera vez
npm run dev        # http://localhost:5173
```

Para ver exactamente lo que se publicará (el build de producción):

```sh
npm run build
npm run preview    # http://localhost:4173
```

Abre `/?flat` para forzar la versión plana y `/?lang=en` (o `es`) para fijar el idioma.
`#projects`, `#experience`, `#about` y `#contact` abren una sección directamente tras el boot.

## Idiomas

Español e inglés. Sin `?lang=`, se usa la última elección guardada y, si no hay, el idioma
del navegador. Se cambia con el selector ES · EN del boot o desde el menú.

## Publicar en Netlify

Publicado en <https://carlos-rabago.netlify.app> (sitio `carlos-rabago`, equipo "Portfolio").
`netlify.toml` trae la configuración (`npm run build`, carpeta `dist`, Node 22) y la carpeta
ya está vinculada al sitio (`.netlify/`, fuera de git). Para publicar una versión nueva:

```sh
npm run build
npx netlify-cli deploy --prod --dir dist --no-build
```

Para que se publique solo con cada `git push`, sube el repo a GitHub y conéctalo en
Netlify: _Site configuration → Build & deploy → Link repository_.

## Qué se puede hacer en la sala

- **Entrada:** la cámara empieza fuera de la cristalera y entra mientras la sala se despierta por
  orden (luz general, neón con parpadeo, flexo y monitor), con sonido si se entró con él. El
  HUD aparece al aterrizar. Quien ya ha entrado antes ve un arranque corto, y el boot siempre
  tiene un botón «Saltar».
- **El guía (astronauta):** habla con bocadillos sobre su casco: saluda según la hora de Madrid,
  cuenta el tiempo que hace, da una pista sobre algo sin descubrir si nadie toca nada durante
  un rato y anima al llegar a 3, 6 y 11 objetos. Mientras habla, el título se aparta. Lógica en
  `src/lib/useGuide.js`; frases en `strings.js` → `guide`.
- **Final:** al descubrir los 12 objetos se activa el **modo fiesta** (la sala cambia de color al
  ritmo de la música) y aparece una **tarjeta de visitante** descargable (PNG 1200 × 630 que se
  dibuja en el navegador: `src/lib/visitorCard.js`). Desde entonces el menú tiene «Modo fiesta» y
  «Tarjeta de visitante».
- **Mirar:** arrastrar (con inercia), rueda o pellizco para acercar, doble clic en una zona
  vacía para volver al centro. Si nadie toca nada, la cámara se balancea despacio.
- **Navegar:** rombos rosas, barra inferior, teclas 1–4 y flechas; Esc vuelve a la sala.
- **Proyectos dentro del monitor:** en pantallas anchas (≥ 900 px y apaisadas) la cámara entra
  en el monitor y el escritorio de proyectos es HTML real colocado sobre la pantalla 3D
  (CSS3D), a escala 1:1. En móvil se muestra como panel.
- **Brillo (bloom):** solo en lo que emite luz (neón, bombillas, guirnalda, LED, ventana).
  En móvil se desactiva para ahorrar batería.
- **Objetos clicables (12):** monitor → Proyectos, cada insignia → su empleo en Experiencia,
  estantería → Sobre mí, ventana (atardecer ↔ noche), lámpara (on/off), altavoces (música
  lo-fi generada en el navegador), teclado (el monitor teclea), taza, astronauta, silla,
  planta y reloj (hora real de Madrid). El contador de arriba a la izquierda cuenta los
  descubiertos y se guarda en el navegador.

## Tiempo real de Madrid

Al cargar, la web consulta Open-Meteo (gratuito, sin clave) y la ventana muestra el cielo de
Madrid: día, atardecer o noche según la salida y puesta de sol reales, con nubes, niebla,
lluvia, nieve o tormenta (relámpagos incluidos). Si llueve y el sonido está activado, se oye.
Si la consulta falla, la sala usa la hora de Madrid sin efectos de tiempo. Hacer clic en la
ventana cambia la hora a mano (día → atardecer → noche).

Para ver los efectos sin esperar a que cambie el tiempo:
`?weather=rain|snow|storm|fog|cloudy|clear` y `?sky=day|dusk|night`
(p. ej. `/?sky=night&weather=storm`).

## Terminal

En Proyectos hay un terminal de verdad (también se abre haciendo clic en el teclado de la
sala). Comandos, en español o inglés: `help`, `whoami`, `ls`, `open <n>`, `exp`,
`cd <sección>`, `contacto`, `cv`, `email`, `tiempo`, `dia` / `atardecer` / `noche`,
`lampara`, `musica`, `lang es|en`, `fecha`, `clear`, `history`, `exit`… y un comando oculto
con `sudo`. ↑/↓ recorren el historial y Tab autocompleta.

## Formulario de contacto

Envía a **Netlify Forms** (sin servidor propio). Netlify detecta el formulario oculto de
`index.html` al publicar; los campos deben coincidir con `src/components/ContactForm.jsx`.
Los mensajes se ven en Netlify → sitio `carlos-rabago` → *Forms*, y los avisos por email se
configuran en *Forms → Form notifications*. En local (`npm run dev`) no hay Netlify, así que
el envío falla a propósito y ofrece el email directo.

## Modelos 3D externos

La sala es el modelo **Minimalistic Modern Office** (`public/models/office.glb`): se descarga
mientras corre el boot y, si fallara, se muestra la versión plana. Su luz va "horneada" en las
texturas; `buildRoom.js` la tiñe y atenúa según la hora, el tiempo y la lámpara. Sobre ella se
colocan nuestros objetos (monitor, flexo, insignias…) y se reaprovechan sus piezas: la silla
gira, las plantas se agitan y la cristalera es la ventana del tiempo de Madrid.

La silla (`chair.glb`) se carga junto a la oficina y sustituye a la suya (si no carga, se queda la
de la oficina). Los altavoces (`speaker-1.glb`) se pintan primero con geometría simple y el
modelo los reemplaza al terminar de cargar.

1. Deja el original en `src-images/models/` (no se publica).
2. Optimízalo (simplifica la malla, une piezas por material y comprime con meshopt):

   ```sh
   npx @gltf-transform/cli optimize scene.gltf public/models/<nombre>.glb \
     --compress meshopt --palette false --instance false \
     --simplify-ratio 0.04 --simplify-error 0.008 --texture-compress false
   ```

   El altavoz pasó de 17,8 MB y 436.000 triángulos a 412 KB y unos 45.000; la oficina, de
   14,6 MB a 1 MB (añadiendo `--texture-compress webp --texture-size 1024`).
3. Regístralo en `src/scene/models.js` (ruta, altura en metros, materiales que brillan) y sus
   créditos en `src/scene/credits.js`: se muestran en Contacto (CC BY obliga a citar al autor).

El flexo (`lamp.glb`), la planta de la estantería (`desk-plant.glb`) y el material de escritorio
(`stationery.glb`) son de **Poly Haven** (CC0) y se cargan igual: si alguno falla, se dibuja una
versión simple con geometría. El resto del escritorio (monitor, teclado, ratón, taza, libreta,
móvil y astronauta) es geometría propia en `src/scene/desk.js`.

Créditos actuales (Sketchfab, CC BY 4.0): «Minimalistic Modern Office» de dylanheyes,
«Office Chair» de djeustice y «Speaker Vipe Nitro X7» de madebyvipe. Poly Haven (CC0):
Desk Lamp Arm 01, Potted Plant 04 y Stationery Supplies.

## Imágenes de proyectos

Las capturas originales van en `src-images/projects/` (no se publican). `npm run images`
genera versiones WebP de 1280 px en `public/projects/`, que son las que usa el sitio
(`image` en `projects.json`). Al añadir un proyecto: suelta la captura, ejecuta el script y
apunta `image` a `/projects/<nombre>.webp` en ambos idiomas.

### Vídeos de proyectos

Las tarjetas de proyecto con `video` en `projects.json` muestran un bucle corto de la web
(scroll abajo y vuelta arriba, unos 15 s, 768 px, sin audio) en `public/projects/video/`. Solo se
descarga y reproduce mientras la tarjeta está a la vista; con «reducir movimiento» o ahorro de
datos se queda la imagen fija. La imagen fija es el primer fotograma del vídeo
(`<nombre>.webp` junto al `.mp4`), para que no haya salto al empezar.

Se grabaron con Chrome a 1280 × 720 (tras aceptar cookies y avisos de edad) y se comprimieron así:

```sh
ffmpeg -i captura.mp4 -vf "fps=30,scale=768:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an public/projects/video/<nombre>.mp4
ffmpeg -i public/projects/video/<nombre>.mp4 -frames:v 1 -c:v libwebp -quality 80 public/projects/video/<nombre>.webp
```

Nexho, Budweiser y Boreal no tienen vídeo: la primera bloquea las visitas automatizadas, la
segunda no responde y la tercera redirige ahora a otra empresa.

## Dónde cambiar cosas

| Qué                                           | Dónde                                              |
| --------------------------------------------- | -------------------------------------------------- |
| Proyectos, empleos, estudios, stack, contacto | `src/data/es/*.json` y `src/data/en/*.json`        |
| Textos de interfaz, pistas y avisos (ES/EN)   | `src/i18n/strings.js`                              |
| Capturas de proyectos                         | `src-images/projects/` y luego `npm run images`    |
| Vídeos de proyectos                           | `public/projects/video/` y `video` en `projects.json` |
| CV                                            | `public/cv/`                                       |
| Colores y tipografía                          | variables `:root` al inicio de `src/styles.css`    |
| Habitación (muebles, luces, texturas)         | `src/scene/buildRoom.js`, `src/scene/textures.js`  |
| Objetos del escritorio                        | `src/scene/desk.js`                                |
| Orden y tiempos del despertar de la sala      | `WAKE` en `src/scene/buildRoom.js`                 |
| Posición de cámara de cada sección            | `src/scene/stops.js`                               |
| Nombre y pista de cada objeto clicable        | `objects` en `src/i18n/strings.js`                 |
| Qué pasa al pulsar cada objeto (avisos)       | `onInteract` en `src/App.jsx`                      |
| Música y efectos de sonido                    | `src/lib/audio.js`                                 |
| Comandos del terminal                         | `src/components/Terminal.jsx` y `terminal` en `strings.js` |
| Tiempo de Madrid y cálculo día/atardecer/noche | `src/lib/weather.js`                              |
| Intensidad del brillo (bloom) y exposición    | `BLOOM` y `toneMappingExposure` en `RoomCanvas.jsx` |
| Qué objetos brillan y cuánto                  | llamadas a `ctx.glow(color, boost)` en `buildRoom.js` |
| Cuándo Proyectos va dentro del monitor        | `screenMode` (media query) en `src/App.jsx`        |
| Texto y pasos del boot                        | `boot` en `src/i18n/strings.js`                    |
| Frases y ritmo del guía (astronauta)          | `guide` en `strings.js`, `src/lib/useGuide.js`     |

Las insignias del panel perforado se generan solas desde `experience.json` (las cinco primeras
entradas), así que añadir o quitar un empleo ahí cambia también la escena.

Al editar `src/scene/stops.js` recarga la página: el bucle de render conserva la posición
anterior hasta entonces.
