import * as THREE from 'three';
import { badgeTexture, createClock, dropletsTexture, pegboardTexture, rainTexture, rng, roundSprite, snowTexture } from './textures';
import { buildDesk } from './desk';
import { buildSkyline } from './skyline';
import { PINK, addMesh, box, eachMaterial, fitModel, group, rounded, std } from './helpers';
import { makeInteractive, noRaycast } from './interactive';
import { MODELS, loadModel } from './models';
import { getContent } from '../content';
import { STRINGS } from '../i18n/strings';

const BADGE_ACCENTS = ['#ff9ebd', '#7fd6ff', '#b79cff', '#ffd29a', '#4ade80'];

/**
 * Medidas de la sala (metros, coordenadas de mundo). La oficina (.glb) se gira y
 * se desplaza para que la cristalera quede al fondo (z ≈ -4.9), el suelo en y = 0
 * y la sala se abra hacia la cámara (+z). Todo lo demás se coloca respecto a esto.
 */
const OFFICE = { position: [0, 1.45, -4.9], rotationY: -Math.PI / 2 };
const DESK = { top: 0.81, front: -0.66, back: -1.37 };
const GLASS = { z: -4.95, width: 8.7, height: 4.05, centerY: 2.15 };
const WALL_RIGHT = 4.35; // pared de hormigón de la derecha (el muro de las insignias)

/** Encendido al entrar: [pieza, inicio (s), duración (s), parpadea]. */
const WAKE = [
    ['room', 0.5, 1.6],
    ['ceiling', 0.9, 0.55, true],
    ['neon', 1.6, 0.7, true],
    ['lamp', 2.2, 0.12],
    ['monitor', 2.6, 0.5, true],
];
// patrón de parpadeo de un tubo de neón al arrancar
const FLICKER = [0, 1, 0, 0, 1, 0.3, 0, 1, 1, 0, 1, 1];

/**
 * Construye la sala sobre el modelo de oficina ya cargado. Devuelve:
 * - `scene`
 * - `hotspots`: los rombos de sección (para las etiquetas flotantes)
 * - `screen`: dónde va la pantalla HTML real del monitor (CSS3D)
 * - `update(time, dt, { musicLevel })`: animaciones y transiciones
 * - `apply({ lamp, sky, music, weather })`: estado de la sala que controla la app
 *
 * Los objetos clicables se encuentran por raycast a través de `userData.item`.
 */
export function buildRoom({ office, models = {}, envMap = null, lowPower = false, lang = 'es' }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d17);

    const ctx = {
        scene,
        lowPower,
        // Con bloom (no en modo ligero) las luces usan valores >1: solo eso brilla con halo.
        hdr: !lowPower,
        t: STRINGS[lang],
        c: getContent(lang),
        animations: [],
        items: [],
        hotspots: [],
        // valores actuales (0..1) que se acercan suavemente a `target`
        world: { lamp: 1, day: 0, night: 0, music: 0, rain: 0, snow: 0, fog: 0, party: 0, gravity: 0 },
        target: { lamp: 1, day: 0, night: 0, music: 0, rain: 0, snow: 0, fog: 0, party: 0, gravity: 0 },
        musicLevel: 0,
        storm: false,
        flash: 0, // relámpago (0..1), solo con tormenta
        daylight: 1, // 0..1: cuánta luz natural hay (para atenuar los reflejos de noche)
        // encendido de la sala al entrar (0 = apagado, 1 = encendido); ver WAKE
        wake: { room: 0, ceiling: 0, neon: 0, lamp: 0, monitor: 0 },
        anchors: {}, // puntos de la escena que la interfaz sigue en pantalla (bocadillo del guía)
        guideTalking: 0, // 0..1 mientras el guía habla (el astronauta saluda)
        reflectors: [],
        events: null, // callback para avisar de momentos (p. ej. sonidos del encendido)
    };
    ctx.emit = (name) => ctx.events?.(name);
    /** Da reflejos del entorno a un material; se atenúan de noche. */
    ctx.reflect = (material, intensity = 0.6) => {
        if (envMap) {
            material.envMap = envMap;
            material.envMapIntensity = intensity;
            ctx.reflectors.push({ material, intensity });
        }
        return material;
    };
    /** Color emisivo: en HDR se multiplica por `boost` para que supere el umbral del bloom. */
    ctx.glow = (color, boost) => new THREE.Color(color).multiplyScalar(ctx.hdr ? boost : 1);
    /**
     * Gravedad cero: cuánto sube y gira un objeto ahora mismo (0 si no hay gravedad cero).
     * Cada objeto usa su propia semilla para no moverse a la vez que los demás.
     */
    const still = { y: 0, rx: 0, ry: 0, rz: 0 };
    ctx.drift = (seed, t, lift = 1) => {
        const g = ctx.world.gravity;
        if (g < 0.001) return still;
        return {
            y: g * lift * (0.1 + 0.08 * ((seed * 7.31) % 1) + Math.sin(t * 0.7 + seed) * 0.025),
            rx: g * Math.sin(t * 0.43 + seed) * 0.45,
            ry: g * Math.sin(t * 0.31 + seed * 2.1) * 0.6,
            rz: g * Math.cos(t * 0.37 + seed * 1.3) * 0.4,
        };
    };
    /** Registra un objeto quieto para que flote con la gravedad cero (vuelve a su sitio al acabar). */
    ctx.floaters = [];
    ctx.float = (object, seed, lift = 1) => {
        ctx.floaters.push({ object, seed, lift, base: object.position.clone(), rot: object.rotation.clone(), resting: true });
        return object;
    };
    ctx.interactive = (root, def) => {
        const item = makeInteractive(root, { ...ctx.t.objects[def.key], ...def });
        ctx.items.push(item);
        return item;
    };

    // Primero la transición de estado, para que el resto lea valores ya actualizados.
    ctx.animations.push((t, dt) => {
        const k = 1 - Math.exp(-dt * 3.2);
        Object.keys(ctx.world).forEach((key) => {
            ctx.world[key] += (ctx.target[key] - ctx.world[key]) * k;
        });
        // tormenta: de vez en cuando, un relámpago que se apaga en décimas de segundo
        if (ctx.storm && Math.random() < dt * 0.15) ctx.flash = 1;
        ctx.flash *= Math.exp(-dt * 7);
        ctx.reflectors.forEach(({ material, intensity }) => {
            material.envMapIntensity = intensity * (0.25 + 0.75 * ctx.daylight);
        });
    });

    // Encendido al entrar: cada pieza se enciende a su momento (algunas parpadean como un neón).
    let wakeStart = null;
    let lastTime = 0;
    const fired = new Set();
    ctx.animations.push((t) => {
        lastTime = t;
        if (wakeStart === null) return;
        const elapsed = t - wakeStart;
        WAKE.forEach(([key, start, duration, flicker]) => {
            const p = Math.min(1, Math.max(0, (elapsed - start) / duration));
            ctx.wake[key] = flicker && p > 0 && p < 1 ? FLICKER[Math.floor(p * FLICKER.length)] * p : p;
            if (p > 0 && !fired.has(key)) {
                fired.add(key);
                ctx.emit(`wake:${key}`);
            }
        });
    });
    const wake = ({ instant = false } = {}) => {
        if (instant) Object.keys(ctx.wake).forEach((key) => (ctx.wake[key] = 1));
        else wakeStart ??= lastTime;
    };

    setupOffice(ctx, office, models.chair ?? null);
    buildSkyline(ctx);
    buildWeather(ctx);
    buildDesk(ctx, { top: DESK.top, back: DESK.back, models });
    buildFeatureWall(ctx, models);
    buildSpeakers(ctx);
    buildDust(ctx);
    buildLights(ctx);

    // al final: la gravedad cero mueve objetos que ya han colocado sus propias animaciones
    ctx.animations.push((t) => {
        const off = ctx.world.gravity < 0.001;
        ctx.floaters.forEach((f) => {
            if (off && f.resting) return;
            const d = ctx.drift(f.seed, t, f.lift);
            f.object.position.set(f.base.x, f.base.y + d.y, f.base.z);
            f.object.rotation.set(f.rot.x + d.rx, f.rot.y + d.ry, f.rot.z + d.rz);
            f.resting = off;
        });
    });

    // Rombos rosas que flotan sobre cada zona: atajos a cada sección.
    [
        { id: 'projects', num: '01', at: [0, 1.82, -1.25] },
        { id: 'experience', num: '02', at: [WALL_RIGHT - 0.3, 2.72, 1.0] },
        { id: 'about', num: '03', at: [-1.6, 2.6, -4.3] },
        { id: 'contact', num: '04', at: [1.05, 1.34, -1.1] },
    ].forEach((spot, i) => ctx.hotspots.push(buildHotspot(ctx, spot, i)));

    const update = (time, dt, { musicLevel = 0 } = {}) => {
        ctx.musicLevel += (musicLevel - ctx.musicLevel) * Math.min(1, dt * 18);
        ctx.animations.forEach((fn) => fn(time, dt));
        ctx.items.forEach((item) => item.tick(dt));
        ctx.hotspots.forEach((h) => h.tick(dt));
    };

    const apply = ({ lamp, sky, music, weather, party, gravity }) => {
        ctx.target.lamp = lamp ? 1 : 0;
        ctx.target.gravity = gravity ? 1 : 0;
        ctx.target.party = party ? 1 : 0;
        ctx.target.day = sky === 'day' ? 1 : 0;
        ctx.target.night = sky === 'night' ? 1 : 0;
        ctx.target.music = music ? 1 : 0;
        const wet = weather === 'rain' || weather === 'storm';
        ctx.target.rain = wet ? 1 : 0;
        ctx.target.snow = weather === 'snow' ? 1 : 0;
        ctx.target.fog = weather === 'fog' ? 1 : weather === 'cloudy' ? 0.45 : wet ? 0.5 : 0;
        ctx.storm = weather === 'storm';
    };

    // los modelos que cargan después (altavoces) no deben añadirse a una escena ya desmontada
    const dispose = () => {
        ctx.disposed = true;
    };

    return {
        scene,
        hotspots: ctx.hotspots,
        screen: ctx.screenAnchor,
        anchors: ctx.anchors,
        update,
        apply,
        wake,
        dispose,
        set onEvent(fn) {
            ctx.events = fn;
        },
        set guideTalking(value) {
            ctx.guideTalking = value;
        },
    };
}

/**
 * Coloca la oficina y adapta su luz horneada (texturas emisivas) a la hora, el
 * tiempo y la lámpara. Reaprovecha sus piezas: la cristalera es la "ventana", la
 * silla gira y las plantas se agitan.
 */
function setupOffice(ctx, office, chairModel) {
    const { scene } = ctx;
    const root = group(scene, OFFICE.position, OFFICE.rotationY);
    root.add(office);
    root.updateMatrixWorld(true);

    const byMaterial = {};
    office.traverse((obj) => {
        if (!obj.isMesh) return;
        (byMaterial[obj.material.name] ??= []).push(obj);
        // sombras de nuestros objetos sobre la mesa, la alfombra y el suelo
        obj.receiveShadow = true;
        obj.castShadow = false;
    });

    // La silla: se pasa al lado de la cámara, girada, como si alguien acabara de levantarse.
    // Un pivote en su centro permite que gire sobre sí misma al hacer clic. Si se cargó
    // MODELS.chair, sustituye a la de la oficina.
    const officeChair = byMaterial.Chair[0];
    let chair;
    if (chairModel) {
        // la silla de la oficina ya no se usa: fuera de la escena y de la memoria de la GPU
        officeChair.removeFromParent();
        officeChair.geometry.dispose();
        officeChair.material.map?.dispose();
        officeChair.material.emissiveMap?.dispose();
        officeChair.material.dispose();
        chair = group(scene);
        const fitted = fitModel(chairModel, MODELS.chair.height);
        fitted.rotation.y = MODELS.chair.facing;
        eachMaterial(fitted, (m, mesh) => {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            ctx.reflect(m, 0.45);
        });
        chair.add(fitted);
    } else {
        const chairCenter = new THREE.Box3().setFromObject(officeChair).getCenter(new THREE.Vector3());
        chair = group(scene, [chairCenter.x, 0, chairCenter.z]);
        chair.attach(officeChair);
        officeChair.castShadow = true;
    }
    chair.position.set(0.95, 0, -0.05);
    const chairBaseRotation = Math.PI + 0.55;
    chair.rotation.y = chairBaseRotation;
    let spin = 0;
    let velocity = 0;
    ctx.interactive(chair, {
        key: 'chair',
        tint: chairModel ? 0.35 : 1, // la silla importada es oscura y realista: resaltado más suave
        onClick: () => {
            velocity += 9;
        },
    });
    ctx.animations.push((t, dt) => {
        spin += velocity * dt;
        velocity *= Math.exp(-dt * 1.4);
        chair.rotation.y = chairBaseRotation + spin;
        const d = ctx.drift(4.2, t, 1.6);
        chair.position.y = d.y;
        chair.rotation.x = d.rx * 0.5;
        chair.rotation.z = d.rz * 0.5;
    });

    // Las plantas son una sola malla: dos cajas invisibles hacen de zona de clic
    // (más barato que el raycast contra miles de hojas) y al pulsar se agitan.
    const plants = byMaterial.Plants[0];
    noRaycast(plants);
    const plantBase = plants.position.clone();
    const plantGroup = group(scene);
    [-3.85, 3.85].forEach((x) => {
        addMesh(plantGroup, box(1.1, 1.9, 1.1), new THREE.MeshBasicMaterial({ visible: false }), [x, 0.95, -4.38], { shadow: false });
    });
    let rustle = 0;
    ctx.interactive(plantGroup, {
        key: 'plant',
        onClick: () => {
            rustle = 1;
        },
    });
    ctx.animations.push((t, dt) => {
        rustle *= Math.exp(-dt * 1.6);
        plants.position.set(plantBase.x + Math.sin(t * 23) * 0.006 * rustle, plantBase.y, plantBase.z + Math.cos(t * 19) * 0.006 * rustle);
    });

    // La cristalera hace de ventana: clic para cambiar la hora.
    const glass = byMaterial.Glass[0];
    ctx.interactive(glass, { key: 'window' });

    // Luz horneada: se tiñe y se atenúa según la hora; la lámpara del techo se apaga con la del escritorio.
    const baked = [];
    office.traverse((obj) => {
        if (!obj.isMesh || obj === glass) return;
        const m = obj.material;
        if (m.name === 'LightEmission' || m.name === 'Background') return;
        if (!m.emissiveMap) return;
        // la luz de nuestras lámparas suma algo encima, pero la base es la horneada
        m.color.multiplyScalar(0.3);
        baked.push(m);
    });
    // si se usa la silla de la oficina, salió de su jerarquía (para girar sobre su pivote):
    // su material (ya clonado por makeInteractive) se añade a mano a la luz horneada
    if (!chairModel) {
        officeChair.material.color.multiplyScalar(0.3);
        baked.push(officeChair.material);
    }

    const ceiling = byMaterial.LightEmission[0].material;
    ceiling.emissive = new THREE.Color(0xffffff);

    // el exterior es solo emisivo: nuestras luces no deben aclararlo de noche
    const sky = byMaterial.Background[0].material;
    sky.color.setScalar(0);

    const tint = { dusk: new THREE.Color(1, 0.8, 0.74), day: new THREE.Color(1, 1, 1), night: new THREE.Color(0.55, 0.62, 1) };
    const skyTint = { dusk: new THREE.Color(1, 0.56, 0.5), day: new THREE.Color(1, 1, 1), night: new THREE.Color(0.06, 0.08, 0.2) };
    const fogTint = new THREE.Color(0.62, 0.65, 0.72);
    const white = new THREE.Color(1, 1, 1);
    const roomColor = new THREE.Color();
    const skyColor = new THREE.Color();
    ctx.skyColor = skyColor; // la ciudad tras la cristalera se funde con este cielo

    const partyColor = new THREE.Color();
    ctx.animations.push((t) => {
        const W = ctx.world;
        const dusk = Math.max(0, 1 - W.day - W.night);
        const daylight = W.day + dusk * 0.66 + W.night * 0.24;
        ctx.daylight = daylight;
        // al entrar la sala está casi a oscuras y se ilumina con el encendido (ver WAKE)
        const level = (daylight * (0.8 + 0.2 * W.lamp) * (1 - 0.15 * W.fog - 0.15 * W.rain) + ctx.flash * 0.6) * (0.1 + 0.9 * ctx.wake.room);
        roomColor.copy(tint.dusk).lerp(tint.day, W.day).lerp(tint.night, W.night);
        // modo fiesta: la luz de la sala recorre el arcoíris
        partyColor.setHSL((t * 0.08) % 1, 0.7, 0.6);
        roomColor.lerp(partyColor, W.party * 0.45);
        baked.forEach((m) => {
            m.emissive.copy(roomColor);
            m.emissiveIntensity = level;
            m.userData.emissiveBase = roomColor;
            m.userData.emissiveIntensityBase = level;
        });

        skyColor
            .copy(skyTint.dusk)
            .lerp(skyTint.day, W.day)
            .lerp(skyTint.night, W.night)
            .lerp(fogTint.clone().multiplyScalar(0.25 + 0.75 * daylight), Math.min(1, W.fog * 0.7 + W.rain * 0.3 + W.snow * 0.4))
            .lerp(white, ctx.flash * 0.8);
        sky.emissive.copy(skyColor);

        ceiling.emissiveIntensity = W.lamp * ctx.wake.ceiling * (ctx.hdr ? 2.4 : 1) * (1 + W.party * ctx.musicLevel * 2);
        ceiling.emissive.setRGB(1, 1, 1).lerp(partyColor, W.party);
    });

}

/** Tiempo de Madrid tras la cristalera: lluvia que cae, gotas en el cristal y nieve. */
function buildWeather(ctx) {
    const { width, height, centerY, z } = GLASS;
    const layer = (map, dz, repeat) => {
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(...repeat);
        const mesh = noRaycast(
            new THREE.Mesh(
                new THREE.PlaneGeometry(width, height),
                new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
            ),
        );
        mesh.position.set(0, centerY, z + dz);
        ctx.scene.add(mesh);
        return mesh;
    };
    const rainTex = rainTexture();
    const rain = layer(rainTex, -0.05, [11, 4.5]);
    const drops = layer(dropletsTexture(), 0, [6, 2.6]);
    const snowTex = snowTexture();
    const snow = layer(snowTex, -0.05, [9, 4]);

    ctx.animations.push((t, dt) => {
        const W = ctx.world;
        rainTex.offset.y += dt * 1.7;
        rain.material.opacity = W.rain * 0.8;
        drops.material.opacity = W.rain * 0.65;
        snowTex.offset.y += dt * 0.12;
        snowTex.offset.x = Math.sin(t * 0.4) * 0.05;
        snow.material.opacity = W.snow;
    });
}

/**
 * Muro de la derecha: panel perforado con neón e insignias (Experiencia), una
 * balda de libros debajo (Sobre mí) y el reloj con la hora de Madrid. Todo se
 * construye en coordenadas locales del muro (x a lo largo, z hacia la sala).
 */
function buildFeatureWall(ctx, models) {
    const wall = group(ctx.scene, [WALL_RIGHT, 0, 1.0], -Math.PI / 2);
    buildPegboard(ctx, group(wall, [0, 2.0, 0]));
    buildShelf(ctx, group(wall, [0, 1.12, 0]), models.deskPlant);
    buildClock(ctx, group(wall, [1.6, 2.0, 0.02]));
}

function buildPegboard(ctx, board) {
    const w = 1.9;
    const h = 0.86;
    addMesh(board, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 }), [0, 0, 0.01], { shadow: false });

    const glow = new THREE.MeshBasicMaterial({ color: ctx.glow(PINK, 2.6), toneMapped: false });
    const e = 0.012;
    addMesh(board, box(w + e * 2, e, e * 2), glow, [0, h / 2, 0.016], { shadow: false });
    addMesh(board, box(w + e * 2, e, e * 2), glow, [0, -h / 2, 0.016], { shadow: false });
    addMesh(board, box(e, h, e * 2), glow, [-w / 2, 0, 0.016], { shadow: false });
    addMesh(board, box(e, h, e * 2), glow, [w / 2, 0, 0.016], { shadow: false });

    // Una insignia por empleo, la más reciente a la izquierda. Clic: abre ese empleo.
    const jobs = ctx.c.experience.items.slice(0, 5);
    const spacing = w / (jobs.length + 0.35);
    jobs.forEach((job, i) => {
        const pivot = group(board, [-w / 2 + spacing * (i + 0.85), h / 2 - 0.1, 0.04]);
        const baseZ = pivot.position.z;

        addMesh(pivot, new THREE.SphereGeometry(0.014, 12, 8), std(0xcfd2e6, { metalness: 0.8, roughness: 0.3 }), [0, 0, 0], { shadow: false });
        const accent = BADGE_ACCENTS[i % BADGE_ACCENTS.length];
        addMesh(pivot, box(0.022, 0.24, 0.004), std(new THREE.Color(accent)), [0, -0.12, 0], { shadow: false });
        const card = addMesh(
            pivot,
            new THREE.PlaneGeometry(0.27, 0.36),
            new THREE.MeshStandardMaterial({
                map: badgeTexture({ company: job.company, role: job.title, period: job.period, accent, current: job.isCurrent && ctx.t.scene.currentBadge }),
                roughness: 0.6,
                side: THREE.DoubleSide,
            }),
            [0, -0.43, 0.004],
        );

        const item = ctx.interactive(pivot, {
            key: 'insignias',
            id: `badge-${job.line}`,
            label: job.company,
            hint: ctx.t.scene.badgeHint(job.period),
            section: 'experience',
            focus: job.line,
        });

        const phase = i * 1.3;
        ctx.animations.push((t) => {
            const hover = item.hover();
            pivot.rotation.z = Math.sin(t * (0.9 + hover * 2.5) + phase) * (0.035 + hover * 0.05);
            pivot.position.z = baseZ + hover * 0.05;
            card.scale.setScalar(1 + hover * 0.08);
        });
    });

    const light = new THREE.PointLight(PINK, 2.2, 3.2, 2);
    light.position.set(0, 0, 0.9);
    board.add(light);

    const pink = ctx.glow(PINK, 2.6);
    const party = new THREE.Color();
    const partyGlow = new THREE.Color();
    ctx.animations.push((t) => {
        const on = ctx.wake.neon;
        const W = ctx.world;
        party.setHSL((t * 0.12) % 1, 0.9, 0.62);
        // mismo brillo percibido que el rosa: el verde y el amarillo no queman la imagen
        const lum = 0.2126 * party.r + 0.7152 * party.g + 0.0722 * party.b;
        partyGlow.copy(party).multiplyScalar(Math.min(1.4, 0.71 / Math.max(lum, 0.05)) * (ctx.hdr ? 2.6 : 1));
        glow.color.copy(pink).lerp(partyGlow, W.party).multiplyScalar(on);
        light.color.setRGB(1, 0.62, 0.74).lerp(party, W.party);
        light.intensity = 2.2 * on * (1 + W.party * ctx.musicLevel * 3);
    });
}

/** Balda con libros bajo el panel. Clic: Sobre mí. Al pasar el cursor los libros se asoman. */
function buildShelf(ctx, shelf, plantModel) {
    const rand = rng(5);
    // tonos sobrios de oficina, con algún rosa de la marca
    const palette = [0x2b3a55, 0x3d3f45, 0xe9e2d0, 0xb5654a, 0x7c8b6f, 0x8e7d6a, 0x23252b, 0xff9ebd];
    const bookGeometry = rounded(1, 1, 1, 0.06, 2);
    const width = 1.7;
    const books = [];
    addMesh(shelf, box(width, 0.035, 0.26), std(0x16171f, { roughness: 0.5 }), [0, 0, 0.13]);
    let x = -width / 2 + 0.06;
    while (x < width / 2 - 0.25) {
        const bw = 0.035 + rand() * 0.035;
        const bh = 0.2 + rand() * 0.13;
        const color = palette[Math.floor(rand() * palette.length)];
        const book = addMesh(shelf, bookGeometry, std(color, { roughness: 0.75 }), [x + bw / 2, 0.018 + bh / 2, 0.12], {
            rot: rand() < 0.1 ? [0, 0, 0.18] : undefined,
        });
        book.scale.set(bw, bh, 0.2);
        books.push({ mesh: book, baseZ: book.position.z, baseY: book.position.y, phase: rand() * Math.PI * 2 });
        x += bw + 0.004;
    }
    // una suculenta al final de la balda (modelo de Poly Haven; si no carga, una sencilla)
    if (plantModel) {
        const plant = fitModel(plantModel, 0.24);
        plant.position.set(width / 2 - 0.12, 0.018, 0.13);
        eachMaterial(plant, (m, mesh) => {
            mesh.castShadow = true;
            ctx.reflect(m, 0.3);
        });
        shelf.add(plant);
    } else {
        addMesh(shelf, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 14), std(0xe5e2ee), [width / 2 - 0.12, 0.058, 0.13]);
        for (let i = 0; i < 6; i++) {
            const leaf = addMesh(shelf, new THREE.SphereGeometry(0.035, 10, 8), std(0x7c8b6f, { roughness: 0.6 }), [
                width / 2 - 0.12 + (rand() - 0.5) * 0.07,
                0.16 + rand() * 0.07,
                0.13 + (rand() - 0.5) * 0.07,
            ]);
            leaf.scale.set(0.7, 1.7, 0.7);
        }
    }

    const item = ctx.interactive(shelf, { key: 'books', section: 'about' });
    let floating = false;
    ctx.animations.push((t) => {
        const hover = item.hover();
        const g = ctx.world.gravity;
        if (hover === 0 && g < 0.001 && !floating) return;
        floating = g >= 0.001;
        books.forEach((b, i) => {
            b.mesh.position.z = b.baseZ + hover * (0.02 + Math.max(0, Math.sin(t * 3 + b.phase)) * 0.03);
            const d = ctx.drift(i * 0.9 + 3, t, 0.6);
            b.mesh.position.y = b.baseY + d.y;
            b.mesh.rotation.set(d.rx * 0.6, 0, d.rz * 0.8);
        });
    });
}

/** Reloj de pared con la hora real de Madrid. */
function buildClock(ctx, g) {
    const clock = createClock(ctx.t.scene.clock);
    addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 40), std(0x0c0d1b, { metalness: 0.4, roughness: 0.4 }), [0, 0, 0], {
        rot: [Math.PI / 2, 0, 0],
    });
    addMesh(
        g,
        new THREE.CircleGeometry(0.175, 48),
        new THREE.MeshStandardMaterial({ map: clock.texture, roughness: 0.5, emissive: 0xffffff, emissiveMap: clock.texture, emissiveIntensity: 0.18 }),
        [0, 0, 0.021],
        { shadow: false },
    );
    ctx.interactive(g, { key: 'clock' });
    ctx.animations.push(() => clock.update());
}

/**
 * Altavoces sobre la mesa, a ambos lados del monitor. Clic: música generativa.
 * Se pintan primero con geometría simple y, cuando termina de cargar el modelo
 * .glb (MODELS.speaker), se sustituyen por él: las piezas simples quedan
 * invisibles pero siguen sirviendo de zona de clic (mucho más barato que el
 * raycast contra miles de triángulos).
 */
function buildSpeakers(ctx) {
    const speakers = group(ctx.scene);
    const units = [];
    [
        { x: -0.8, toeIn: 0.3 },
        { x: 0.8, toeIn: -0.3 },
    ].forEach(({ x, toeIn }) => {
        const spk = group(speakers, [x, DESK.top, -1.22], toeIn); // girados hacia el centro, como monitores de estudio
        ctx.float(spk, x > 0 ? 7.7 : 12.2, 0.9);
        addMesh(spk, box(0.16, 0.26, 0.15), std(0x0c0d1b, { roughness: 0.6 }), [0, 0.13, 0]);
        const woofer = group(spk, [0, 0.085, 0.076]);
        addMesh(woofer, new THREE.TorusGeometry(0.045, 0.009, 8, 24), std(0xcfd2e6, { metalness: 0.7, roughness: 0.3 }), [0, 0, 0]);
        addMesh(woofer, new THREE.CircleGeometry(0.038, 20), std(0x1b1d33), [0, 0, 0.002], { shadow: false });
        const led = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), new THREE.MeshBasicMaterial({ color: 0x2a2d40, toneMapped: false }));
        led.position.set(0.055, 0.235, 0.077);
        led.userData.noTint = true;
        spk.add(led);
        units.push({ spk, woofer, led, model: null, glow: [] });
    });

    const item = ctx.interactive(speakers, { key: 'speakers' });

    loadModel(MODELS.speaker.url)
        .then((model) => {
            if (ctx.disposed) return;
            const template = fitModel(model, MODELS.speaker.height);

            units.forEach((unit) => {
                // lo simple deja de verse (y de proyectar sombra) pero sigue recibiendo los clics
                unit.spk.traverse((obj) => {
                    if (obj.isMesh) obj.material.visible = false;
                });
                const clone = template.clone(true);
                clone.traverse((obj) => {
                    if (!obj.isMesh) return;
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                    noRaycast(obj);
                });
                eachMaterial(clone, (m) => ctx.reflect(m, 0.6));
                unit.spk.add(clone);
                item.adopt(clone, { tint: 0.3 }); // resaltado rosa más suave: el modelo es negro y metálico
                clone.traverse((obj) => {
                    if (obj.isMesh && MODELS.speaker.glowMaterials.includes(obj.material.name)) {
                        unit.glow.push({ m: obj.material, base: obj.material.emissiveIntensity });
                    }
                });
                unit.model = clone;
            });
        })
        .catch(() => {
            /* sin modelo: se quedan los altavoces simples */
        });

    const ledOff = new THREE.Color(0x2a2d40);
    const ledOn = new THREE.Color(0x4ade80);
    ctx.animations.push(() => {
        const music = ctx.world.music;
        const level = ctx.musicLevel * music;
        units.forEach((unit) => {
            if (unit.model) {
                // modelo: un "latido" leve hacia arriba y las luces suben con el volumen
                unit.model.scale.set(1 + level * 0.03, 1 + level * 0.06, 1 + level * 0.03);
                unit.glow.forEach(({ m, base }) => {
                    m.emissiveIntensity = base * (0.6 + music * 0.6 + level * (ctx.hdr ? 4 : 1.5)) * (1 + ctx.world.party);
                });
            } else {
                unit.woofer.scale.setScalar(1 + level * 0.55);
                unit.led.material.color.copy(ledOff).lerp(ledOn, music).multiplyScalar(1 + (ctx.hdr ? 2 : 0) * music);
            }
        });
    });
}

/** Motas de polvo flotando en la luz de la cristalera. */
function buildDust(ctx) {
    const rand = rng(3);
    const count = ctx.lowPower ? 90 : 180;
    const base = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        base[i * 3] = -3 + rand() * 6;
        base[i * 3 + 1] = 0.3 + rand() * 3.2;
        base[i * 3 + 2] = -4.6 + rand() * 5;
        seeds[i] = rand();
    }
    const positions = base.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.018,
        map: roundSprite(),
        color: 0xffd6e4,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
    });
    ctx.scene.add(noRaycast(new THREE.Points(geo, mat)));

    const dusk = new THREE.Color(0xffd6e4);
    const dayColor = new THREE.Color(0xfff6ea);
    const night = new THREE.Color(0xb8c6ff);
    ctx.animations.push((t) => {
        for (let i = 0; i < count; i++) {
            const s = seeds[i] * 10;
            positions[i * 3] = base[i * 3] + Math.sin(t * 0.13 + s) * 0.09;
            positions[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.11 + s * 1.7) * 0.14;
            positions[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.09 + s * 0.6) * 0.09;
        }
        geo.attributes.position.needsUpdate = true;
        mat.color.copy(dusk).lerp(dayColor, ctx.world.day).lerp(night, ctx.world.night);
        if (ctx.world.party > 0.01) mat.color.lerp(new THREE.Color().setHSL((t * 0.15) % 1, 0.9, 0.7), ctx.world.party);
        mat.opacity = 0.55 + ctx.world.party * 0.35;
    });
}

/** Luces en tiempo real: suman sobre la luz horneada de la oficina. */
function buildLights(ctx) {
    const { scene, world } = ctx;
    const hemi = new THREE.HemisphereLight(0x9aa6d8, 0x1a1626, 0.55);
    scene.add(hemi);

    // foco cenital que da sombras a nuestros objetos sobre la mesa
    const key = new THREE.SpotLight(0xdfe6ff, 30, 16, 0.75, 0.8, 2);
    key.position.set(-1.2, 3.9, 2.2);
    key.target.position.set(0, 0.8, -1.0);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(ctx.lowPower ? 512 : 1024);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    scene.add(key, key.target);

    // luz que entra por la cristalera: atardecer rosado, día blanco o luna azulada
    const sky = new THREE.PointLight(0xd890a8, 8, 10, 2);
    sky.position.set(0, 2.4, -4.2);
    scene.add(sky);

    const skyDusk = new THREE.Color(0xd890a8);
    const skyDay = new THREE.Color(0xe8eeff);
    const skyNight = new THREE.Color(0x7f8cff);
    const party = new THREE.Color();
    ctx.animations.push((t) => {
        const d = world.day;
        const n = world.night;
        hemi.intensity = 0.55 + 0.25 * d - 0.3 * n;
        sky.color.copy(skyDusk).lerp(skyDay, d).lerp(skyNight, n);
        // con lluvia o niebla entra menos luz; los relámpagos la disparan un instante
        sky.intensity = (8 + 2 * d - 4 * n) * (1 - 0.35 * world.rain - 0.25 * world.fog) + ctx.flash * 60;
        // el foco de la sala es "nuestra" luz: se enciende con la sala al entrar
        key.intensity = (30 + 4 * d - 12 * n) * (0.15 + 0.85 * ctx.wake.room);
        // modo fiesta: la luz de la cristalera cambia de color al ritmo de la música
        party.setHSL((t * 0.1 + 0.5) % 1, 0.85, 0.6);
        sky.color.lerp(party, world.party);
        sky.intensity += world.party * ctx.musicLevel * 25;
    });
}

function buildHotspot(ctx, { id, num, at }, index) {
    const label = ctx.t.sections[id];
    const g = group(ctx.scene, at);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), new THREE.MeshBasicMaterial({ color: ctx.glow(PINK, 1.3), toneMapped: false }));
    diamond.scale.set(0.8, 1.35, 0.8);
    g.add(diamond);
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.108, 40),
        new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.45, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }),
    );
    g.add(ring);
    // Zona de clic generosa: el rombo solo mide unos centímetros.
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ visible: false })));

    const state = { hover: 0, target: 0, time: 0 };
    const item = {
        id,
        num,
        label,
        hint: ctx.t.scene.hotspotHint,
        section: id,
        isHotspot: true,
        group: g,
        setHover(on) {
            state.target = on ? 1 : 0;
        },
        tick(dt) {
            state.time += dt;
            const t = state.time;
            g.position.y = at[1] + Math.sin(t * 1.4 + index * 1.7) * 0.03;
            diamond.rotation.y = t * (0.9 + state.hover * 3) + index;
            state.hover += (state.target - state.hover) * Math.min(1, dt * 10);
            g.scale.setScalar(1 + state.hover * 0.45);
            // pulso: el anillo se expande y se desvanece cada pocos segundos
            const pulse = (t * 0.6 + index * 0.25) % 1;
            ring.scale.setScalar(1 + pulse * 0.9);
            ring.material.opacity = (1 - pulse) * (0.5 + state.hover * 0.5);
        },
    };
    g.traverse((obj) => {
        obj.userData.item = item;
    });
    return item;
}
