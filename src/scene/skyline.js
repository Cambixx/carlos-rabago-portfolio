import * as THREE from 'three';
import { roundSprite, rng } from './textures';
import { noRaycast } from './interactive';

/**
 * Madrid al otro lado de la cristalera: la sierra de Guadarrama al fondo, la ciudad,
 * Torrespaña, las Torres KIO y las Cuatro Torres. Por la noche se encienden ventanas
 * y parpadean las balizas rojas; hay estrellas y una luna con la fase real de hoy.
 *
 * La oficina trae un fondo curvo (una foto de niebla en arco alrededor del edificio):
 * la ciudad es una banda que sigue ese arco un poco por dentro. Se dibuja una vez en
 * un canvas que guarda datos, no colores:
 *   R = profundidad (0 vacío, poco = lejos y con bruma, 1 = cerca)
 *   G = ventana (0 sin ventana; si no, un valor aleatorio propio de cada una)
 *   B = baliza roja
 * y un shader decide el color según la hora, el tiempo, los relámpagos y el modo fiesta.
 * En el dibujo, x son metros a lo largo del arco (de izquierda a derecha) e y la altura.
 */

// Vértices (x, z) del fondo curvo de la oficina, de izquierda a derecha, en coordenadas de mundo.
const ARC = [
    [-12.46, 1.89],
    [-12, -1.84],
    [-10.82, -4.49],
    [-8.87, -6.24],
    [-6.2, -7.6],
    [-3.14, -8.51],
    [0, -8.83],
    [3.12, -8.51],
    [6.19, -7.6],
    [8.87, -6.24],
    [10.82, -4.49],
    [12, -1.84],
    [12.46, 1.89],
];
const Y0 = -0.8;
const Y1 = 5.6;
const INSET = { city: 0.3, moon: 0.24, stars: 0.18 };

/** El arco suavizado y desplazado `inset` metros hacia dentro, con su longitud acumulada. */
function arcPath(inset, samples = 96) {
    const curve = new THREE.CatmullRomCurve3(
        ARC.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        false,
        'centripetal',
    );
    const points = curve.getSpacedPoints(samples);
    const length = curve.getLength();
    return {
        length,
        points: points.map((p, i) => {
            const t = curve.getTangentAt(i / samples);
            // normal hacia dentro (hacia la sala)
            return { x: p.x - t.z * inset, z: p.z + t.x * inset, s: (i / samples) * length };
        }),
        at(s) {
            const u = THREE.MathUtils.clamp(s / length, 0, 1);
            const p = curve.getPointAt(u);
            const t = curve.getTangentAt(u);
            return new THREE.Vector3(p.x - t.z * inset, 0, p.z + t.x * inset);
        },
    };
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec3 uSky;
uniform float uDay;
uniform float uNight;
uniform float uFog;
uniform float uFlash;
uniform float uParty;
uniform float uTime;
uniform float uGlow;
varying vec2 vUv;

vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
    vec3 s = texture2D(map, vUv).rgb;
    float depth = s.r;
    float win = s.g;
    float beacon = s.b;
    float alpha = smoothstep(0.02, 0.12, depth);
    if (alpha < 0.004 && beacon < 0.02) discard;

    float dusk = max(0.0, 1.0 - uDay - uNight);
    // fachadas: cristal azulado de día, malva al atardecer, casi negras de noche
    vec3 facade = vec3(0.34, 0.38, 0.47) * uDay + vec3(0.2, 0.14, 0.19) * dusk + vec3(0.018, 0.022, 0.045) * uNight;
    facade *= 0.75 + 0.45 * vUv.y;
    // lo lejano se funde con el cielo (y más con niebla)
    float haze = clamp((1.0 - depth) * 0.9 + uFog * 0.45, 0.0, 1.0);
    vec3 col = mix(facade, uSky, haze);

    // ventanas: cada una tiene su valor; con el tiempo algunas se encienden y otras se apagan
    float has = step(0.01, win);
    float slot = floor(uTime * 0.04 + win * 7.0);
    float r = fract(sin(win * 913.7 + slot * 37.1) * 43758.5453);
    float share = 0.12 * dusk + 0.42 * uNight;
    float lit = has * step(1.0 - share, r);
    vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.82, fract(win * 57.3)));
    warm = mix(warm, hue(fract(uTime * 0.08 + vUv.x * 6.0 + win)), uParty);
    float bright = (0.55 + 0.45 * win) * (1.0 - haze * 0.75) * (1.0 - uFog * 0.5);
    col += warm * lit * bright * (0.5 * dusk + uNight + uParty * 0.6);
    // de día, las ventanas solo reflejan un poco de cielo
    col += vec3(0.02, 0.028, 0.04) * has * win * uDay;

    // relámpago: la ciudad se ilumina un instante
    col = mix(col, vec3(0.75, 0.8, 1.0), uFlash * 0.45 * (1.0 - haze * 0.5));

    // balizas rojas de los rascacielos, sincronizadas como las de verdad
    float blink = pow(max(0.0, sin(uTime * 2.6)), 10.0);
    col += vec3(1.0, 0.08, 0.05) * beacon * (0.25 + 0.75 * blink) * (0.35 + 0.65 * (1.0 - uDay)) * uGlow;
    alpha = max(alpha, beacon * (0.4 + 0.6 * blink));

    // con niebla la ciudad casi desaparece (lo cercano aguanta más)
    alpha *= 1.0 - uFog * (0.88 - 0.45 * depth);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

/**
 * Dibuja la ciudad en el canvas de datos. `landmarks` son las posiciones (metros a lo
 * largo del arco) de los edificios reconocibles.
 */
function drawCity({ width, height, length, landmarks, seed }) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    const px = width / length; // píxeles por metro en horizontal
    const py = height / (Y1 - Y0); // y en vertical
    const X = (x) => x * px;
    const Y = (y) => (Y1 - y) * py;
    const rand = rng(seed);

    g.fillStyle = '#000';
    g.fillRect(0, 0, width, height);

    const depthStyle = (d) => `rgb(${Math.round(d * 255)},0,0)`;
    const solid = (d) => {
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = depthStyle(d);
    };
    const fillRect = (d, x, y, w, h) => {
        solid(d);
        g.fillRect(X(x), Y(y + h), w * px, h * py);
    };
    const fillPath = (d, points) => {
        solid(d);
        g.beginPath();
        points.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.closePath();
        g.fill();
    };
    /** Ventanas en rejilla dentro de un rectángulo; `lean` desplaza cada piso (Torres KIO). */
    const windows = (x, y, w, h, { floor = 0.045, col = 0.05, density = 0.6, lean = 0 } = {}) => {
        g.globalCompositeOperation = 'lighter';
        const ww = Math.max(1, col * 0.6 * px);
        const wh = Math.max(1, floor * 0.5 * py);
        for (let fy = y + floor * 0.6; fy < y + h - floor * 0.4; fy += floor) {
            const shift = (fy - y) * lean;
            for (let fx = x + col * 0.3; fx < x + w - col * 0.5; fx += col) {
                if (rand() > density) continue;
                const v = 0.35 + rand() * 0.65;
                g.fillStyle = `rgb(0,${Math.round(v * 255)},0)`;
                g.fillRect(X(fx + shift), Y(fy + floor * 0.5), ww, wh);
            }
        }
    };
    /** Rascacielos de cristal: de noche se ven franjas de luz por planta, no ventanas sueltas. */
    const floors = (x, y, w, h, { floor = 0.034, lean = 0 } = {}) => {
        g.globalCompositeOperation = 'lighter';
        const segments = 3;
        const sw = (w - 0.02) / segments;
        for (let fy = y; fy < y + h - floor * 0.5; fy += floor) {
            const shift = (fy - y) * lean;
            for (let i = 0; i < segments; i++) {
                if (rand() > 0.72) continue;
                const v = 0.35 + rand() * 0.65;
                g.fillStyle = `rgb(0,${Math.round(v * 255)},0)`;
                g.fillRect(X(x + 0.01 + i * sw + shift), Y(fy + floor * 0.62), Math.max(1, (sw - 0.006) * px), Math.max(1, floor * 0.42 * py));
            }
        }
    };
    const beacon = (x, y, r = 0.024) => {
        g.globalCompositeOperation = 'lighter';
        const grad = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * py);
        grad.addColorStop(0, 'rgb(0,0,255)');
        grad.addColorStop(1, 'rgb(0,0,0)');
        g.fillStyle = grad;
        g.fillRect(X(x) - r * py, Y(y) - r * py, r * 2 * py, r * 2 * py);
    };
    /** Una franja de edificios con alturas aleatorias. */
    const band = (d, low, high, opts = {}) => {
        let x = 0;
        while (x < length) {
            const w = (opts.minW ?? 0.08) + rand() * (opts.varW ?? 0.22);
            const top = low + rand() ** 1.6 * (high - low);
            fillRect(d, x, Y0, w, top - Y0);
            if (opts.windows) windows(x, Y0, w, top - Y0, { floor: opts.floor ?? 0.035, col: opts.col ?? 0.04, density: opts.density ?? 0.5 });
            x += w + rand() * (opts.gap ?? 0.03);
        }
    };

    // 1) la sierra de Guadarrama, muy al fondo
    const ridge = [];
    for (let x = 0; x <= length + 0.1; x += 0.08) {
        ridge.push([x, 2.0 + 0.24 * Math.sin(x * 0.37 + 1.3) + 0.1 * Math.sin(x * 1.21 + 0.4) + 0.05 * Math.sin(x * 3.7) + 0.02 * rand()]);
    }
    fillPath(0.16, [[0, Y0], ...ridge, [length, Y0]]);

    // 2) ciudad lejana, bajo el horizonte (estamos en un piso alto)
    band(0.36, 0.6, 1.55, { windows: true, density: 0.2, floor: 0.045, col: 0.05 });

    // 3) Torrespaña ("el Pirulí")
    {
        const x = landmarks.torrespana;
        fillRect(0.5, x - 0.016, Y0, 0.032, 2.72 - Y0);
        solid(0.5);
        g.beginPath();
        g.ellipse(X(x), Y(2.52), 0.062 * px, 0.036 * py, 0, 0, Math.PI * 2);
        g.fill();
        fillRect(0.5, x - 0.038, 2.64, 0.076, 0.022);
        fillRect(0.5, x - 0.005, 2.72, 0.01, 0.3);
        windows(x - 0.05, 2.5, 0.1, 0.04, { floor: 0.02, col: 0.02, density: 0.9 });
        beacon(x, 3.02, 0.016);
        beacon(x, 2.67, 0.012);
    }

    // 4) ciudad intermedia
    band(0.58, 0.2, 1.05, { windows: true, density: 0.24, minW: 0.12, varW: 0.3, gap: 0.05, floor: 0.055, col: 0.065 });

    // 5) Torres KIO (Puerta de Europa): dos torres inclinadas 15° la una hacia la otra
    {
        const lean = Math.tan((15 * Math.PI) / 180);
        const base = 0.9;
        const top = 2.45;
        const h = top - base;
        const w = 0.15;
        const gap = 0.08 + 2 * h * lean; // a media altura casi se tocan, arriba queda un hueco
        [
            { x: landmarks.kio - gap / 2 - w, dir: 1 },
            { x: landmarks.kio + gap / 2, dir: -1 },
        ].forEach(({ x, dir }) => {
            const dx = h * lean * dir;
            fillPath(0.7, [
                [x, Y0],
                [x + w, Y0],
                [x + w, base],
                [x + w + dx, top],
                [x + dx, top],
                [x, base],
            ]);
            floors(x, base, w, h, { lean: lean * dir });
            beacon(x + dx + 0.02, top + 0.01, 0.014);
            beacon(x + dx + w - 0.02, top + 0.01, 0.014);
        });
    }

    // 6) Cuatro Torres Business Area (con Caleido), lo más cercano de los rascacielos
    {
        const D = 0.85;
        const start = landmarks.cuatroTorres;

        // Caleido (la más baja), con su remate en marco
        const cal = start;
        fillRect(D, cal, Y0, 0.17, 2.72 - Y0);
        floors(cal, 0.4, 0.17, 2.3);
        fillRect(D, cal, 2.72, 0.016, 0.07);
        fillRect(D, cal + 0.154, 2.72, 0.016, 0.07);
        fillRect(D, cal, 2.775, 0.17, 0.015);
        beacon(cal + 0.01, 2.8, 0.013);
        beacon(cal + 0.16, 2.8, 0.013);

        // Torre Cepsa (Foster): dos pilares y un gran arco abierto arriba
        const cx = start + 0.36;
        const cw = 0.2;
        fillRect(D, cx, Y0, 0.03, 3.25 - Y0);
        fillRect(D, cx + cw - 0.03, Y0, 0.03, 3.25 - Y0);
        fillRect(D, cx + 0.03, Y0, cw - 0.06, 2.98 - Y0);
        fillRect(D, cx, 3.2, cw, 0.05);
        floors(cx + 0.03, 0.4, cw - 0.06, 2.58);
        beacon(cx + 0.015, 3.26, 0.014);
        beacon(cx + cw - 0.015, 3.26, 0.014);

        // Torre PwC: remate redondeado
        const pX = start + 0.74;
        const pw = 0.19;
        fillRect(D, pX, Y0, pw, 3.05 - Y0);
        floors(pX, 0.4, pw, 2.62);
        solid(D);
        g.beginPath();
        g.roundRect(X(pX + 0.01), Y(3.17), (pw - 0.02) * px, 0.13 * py, [0.08 * px, 0.08 * px, 0, 0]);
        g.fill();
        beacon(pX + pw / 2, 3.19, 0.014);

        // Torre de Cristal: corona cortada en diagonal
        const tX = start + 1.1;
        const tw = 0.19;
        fillPath(D, [
            [tX, Y0],
            [tX + tw, Y0],
            [tX + tw, 3.12],
            [tX, 3.27],
        ]);
        floors(tX, 0.4, tw, 2.66);
        beacon(tX + 0.012, 3.28, 0.014);

        // Torre Emperador (antes Espacio): fachada curva que sube hacia un lado
        const eX = start + 1.46;
        const ew = 0.2;
        solid(D);
        g.beginPath();
        g.moveTo(X(eX), Y(Y0));
        g.lineTo(X(eX), Y(2.98));
        g.quadraticCurveTo(X(eX + ew * 0.55), Y(2.99), X(eX + ew), Y(3.1));
        g.lineTo(X(eX + ew), Y(Y0));
        g.closePath();
        g.fill();
        floors(eX, 0.4, ew, 2.52);
        beacon(eX + ew - 0.012, 3.11, 0.014);
    }

    // 7) tejados cercanos, justo debajo de nosotros
    band(1, -0.55, 0.05, { windows: true, density: 0.22, minW: 0.25, varW: 0.5, gap: 0.08, floor: 0.08, col: 0.09 });

    g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
}

/** Fase de la luna (0 nueva, 0,5 llena) a partir de una luna nueva conocida. */
export function moonPhase(date = new Date()) {
    const synodic = 29.530588853;
    const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
    return (((days / synodic) % 1) + 1) % 1;
}

function moonTexture(phase) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    const c = size / 2;
    const r = size * 0.3;
    // halo suave
    const halo = g.createRadialGradient(c, c, r * 0.9, c, c, c);
    halo.addColorStop(0, 'rgba(220,228,255,0.22)');
    halo.addColorStop(1, 'rgba(220,228,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    // la parte en sombra se intuye (luz cenicienta)
    g.fillStyle = 'rgba(150,160,200,0.18)';
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    // parte iluminada: medio disco + elipse del terminador
    const waxing = phase < 0.5;
    const k = Math.cos(phase * Math.PI * 2); // 1 nueva, -1 llena
    g.save();
    g.translate(c, c);
    if (!waxing) g.scale(-1, 1);
    g.fillStyle = '#f4f1e6';
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(0, 0, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k < 0);
    g.fill();
    // un par de "mares" muy sutiles, solo sobre la parte iluminada
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(120,120,140,0.16)';
    [
        [0.2, -0.25, 0.28],
        [-0.15, 0.1, 0.22],
        [0.3, 0.3, 0.16],
    ].forEach(([x, y, s]) => {
        g.beginPath();
        g.arc(x * r, y * r, s * r, 0, Math.PI * 2);
        g.fill();
    });
    g.restore();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function buildSkyline(ctx) {
    const scale = ctx.lowPower ? 0.5 : 1;
    const city = arcPath(INSET.city);
    const L = city.length;
    // dónde cae cada edificio reconocible, en metros a lo largo del arco (mitad ≈ detrás del escritorio)
    const mid = L / 2;
    const landmarks = { torrespana: mid - 4.6, kio: mid - 1.7, cuatroTorres: mid + 4.6 };

    // banda curva con la ciudad
    const positions = [];
    const uvs = [];
    const index = [];
    city.points.forEach((p, i) => {
        positions.push(p.x, Y0, p.z, p.x, Y1, p.z);
        uvs.push(p.s / L, 0, p.s / L, 1);
        if (i > 0) {
            const a = (i - 1) * 2;
            index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: drawCity({ width: 4096 * scale, height: 1024 * scale, length: L, landmarks, seed: 11 }) },
            uSky: { value: new THREE.Color() },
            uDay: { value: 0 },
            uNight: { value: 0 },
            uFog: { value: 0 },
            uFlash: { value: 0 },
            uParty: { value: 0 },
            uTime: { value: 0 },
            uGlow: { value: ctx.hdr ? 6 : 1.4 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const band = noRaycast(new THREE.Mesh(geometry, material));
    band.renderOrder = -1;
    band.frustumCulled = false;
    ctx.scene.add(band);

    // estrellas (solo con el cielo despejado de noche), por detrás de la ciudad
    const rand = rng(17);
    const starPath = arcPath(INSET.stars);
    const starCount = ctx.lowPower ? 90 : 180;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        const p = starPath.at(rand() * starPath.length);
        starPositions.set([p.x, 2.5 + rand() ** 0.7 * 3.0, p.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
        size: 0.04,
        map: roundSprite(),
        color: 0xdfe6ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
    });
    const stars = noRaycast(new THREE.Points(starGeo, starMat));
    stars.renderOrder = -3;
    stars.frustumCulled = false;
    ctx.scene.add(stars);

    // la luna, con la fase de hoy, arriba a la derecha de la cristalera
    const moonMat = new THREE.MeshBasicMaterial({ map: moonTexture(moonPhase()), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const moon = noRaycast(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), moonMat));
    moon.position.copy(arcPath(INSET.moon).at(mid + 2.8)).setY(4.45);
    moon.lookAt(0, 2, 0);
    moon.renderOrder = -2;
    ctx.scene.add(moon);
    const white = new THREE.Color(1, 1, 1);

    ctx.animations.push((t) => {
        const W = ctx.world;
        const fog = Math.min(1, W.fog + W.rain * 0.35 + W.snow * 0.5);
        const u = material.uniforms;
        // el cielo de la oficina es una foto de niebla: su tono medio es más oscuro que el color que se le aplica
        u.uSky.value.copy(ctx.skyColor ?? white).multiplyScalar(0.5);
        u.uDay.value = W.day;
        u.uNight.value = W.night;
        u.uFog.value = fog;
        u.uFlash.value = ctx.flash;
        u.uParty.value = W.party;
        u.uTime.value = t;
        const clear = Math.max(0, 1 - fog * 1.3);
        const dark = W.night + Math.max(0, 1 - W.day - W.night) * 0.35;
        starMat.opacity = W.night * clear * (0.6 + 0.25 * Math.sin(t * 1.7));
        moonMat.opacity = dark * clear;
        moonMat.color.copy(white).multiplyScalar(ctx.hdr ? 1.25 : 1);
    });
}
