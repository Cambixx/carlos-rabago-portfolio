import * as THREE from 'three';
import { badgeTexture, createClock, createScreen, dropletsTexture, keyboardTexture, pegboardTexture, rainTexture, rng, roundSprite, snowTexture } from './textures';
import { makeInteractive, noRaycast } from './interactive';
import { MODELS, loadModel } from './models';
import { getContent } from '../content';
import { STRINGS } from '../i18n/strings';

const PINK = 0xff9ebd;
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

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function std(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts });
}

function addMesh(parent, geometry, material, [x, y, z], { shadow = true, rot } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * Normaliza un modelo cargado: lo escala a `height` metros de alto, lo apoya en
 * y = 0 y lo centra en x/z. Devuelve un grupo listo para colocar y clonar.
 */
function fitModel(model, height) {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = height / size.y;
    model.scale.multiplyScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const fitted = new THREE.Group();
    fitted.add(model);
    return fitted;
}

function group(parent, [x, y, z] = [0, 0, 0], rotationY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotationY;
    parent.add(g);
    return g;
}

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
export function buildRoom({ office, chairModel = null, lowPower = false, lang = 'es' }) {
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
        world: { lamp: 1, day: 0, night: 0, music: 0, rain: 0, snow: 0, fog: 0 },
        target: { lamp: 1, day: 0, night: 0, music: 0, rain: 0, snow: 0, fog: 0 },
        musicLevel: 0,
        storm: false,
        flash: 0, // relámpago (0..1), solo con tormenta
    };
    /** Color emisivo: en HDR se multiplica por `boost` para que supere el umbral del bloom. */
    ctx.glow = (color, boost) => new THREE.Color(color).multiplyScalar(ctx.hdr ? boost : 1);
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
    });

    setupOffice(ctx, office, chairModel);
    buildWeather(ctx);
    buildDeskItems(ctx);
    buildFeatureWall(ctx);
    buildSpeakers(ctx);
    buildDust(ctx);
    buildLights(ctx);

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

    const apply = ({ lamp, sky, music, weather }) => {
        ctx.target.lamp = lamp ? 1 : 0;
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

    return { scene, hotspots: ctx.hotspots, screen: ctx.screenAnchor, update, apply, dispose };
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
        fitted.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = true;
            obj.receiveShadow = true;
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

    ctx.animations.push(() => {
        const W = ctx.world;
        const dusk = Math.max(0, 1 - W.day - W.night);
        const daylight = W.day + dusk * 0.66 + W.night * 0.24;
        const level = daylight * (0.8 + 0.2 * W.lamp) * (1 - 0.15 * W.fog - 0.15 * W.rain) + ctx.flash * 0.6;
        roomColor.copy(tint.dusk).lerp(tint.day, W.day).lerp(tint.night, W.night);
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

        ceiling.emissiveIntensity = W.lamp * (ctx.hdr ? 2.4 : 1);
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

function buildDeskItems(ctx) {
    const { scene } = ctx;
    const top = DESK.top;
    addMesh(scene, box(0.8, 0.004, 0.3), std(0x12142a), [0.05, top + 0.002, -0.9]);
    const mouse = addMesh(scene, new THREE.SphereGeometry(0.03, 16, 12), std(0xf4f2f8, { roughness: 0.4 }), [0.33, top + 0.016, -0.9]);
    mouse.scale.set(0.9, 0.5, 1.4);
    addMesh(scene, box(0.075, 0.008, 0.155), std(0x07080f, { roughness: 0.25, metalness: 0.4 }), [0.84, top + 0.004, -0.8], { rot: [0, 0.5, 0] });
    addMesh(scene, box(0.2, 0.014, 0.28), std(0xffd29a, { roughness: 0.8 }), [-0.62, top + 0.007, -0.86], { rot: [0, -0.3, 0] });

    const screen = buildMonitor(ctx, [0, top, -1.25]);
    buildKeyboard(ctx, screen, [0, top + 0.015, -0.9]);
    buildMug(ctx, [0.6, top, -0.85]);
    buildLamp(ctx, [-1.02, top, -1.2]);
    buildAstronaut(ctx, [1.05, top, -1.1]);
}

/** Monitor con terminal animado. Clic: Proyectos. */
function buildMonitor(ctx, [mx, top, mz]) {
    const my = top + 0.44;
    const dark = std(0x0e0f1e, { roughness: 0.6 });
    const monitor = group(ctx.scene);
    addMesh(monitor, box(1.08, 0.64, 0.04), dark, [mx, my, mz]);
    const screen = createScreen(ctx.t.scene.screen);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.56), new THREE.MeshBasicMaterial({ map: screen.texture, color: ctx.glow(0xffffff, 1.15), toneMapped: false }));
    panel.position.set(mx, my, mz + 0.0215);
    monitor.add(panel);
    addMesh(monitor, box(0.06, 0.2, 0.03), dark, [mx, top + 0.12, mz - 0.01]);
    addMesh(monitor, box(0.34, 0.012, 0.22), dark, [mx, top + 0.006, mz + 0.04]);

    const item = ctx.interactive(monitor, { key: 'monitor', section: 'projects' });

    const glow = new THREE.PointLight(0xa0b4ff, 3.5, 2.6, 2);
    glow.position.set(mx, my, mz + 0.5);
    ctx.scene.add(glow);
    ctx.animations.push((t, dt) => {
        screen.update(dt);
        glow.intensity = 3.5 + Math.sin(t * 2.3) * 0.12 + item.hover() * 2;
    });
    // Dónde va la pantalla HTML real (CSS3D) en la sección Proyectos.
    ctx.screenAnchor = { center: panel.position.clone(), width: 1.0, height: 0.56 };
    return screen;
}

/** Teclado. Clic: las teclas se hunden y el monitor teclea un saludo. */
function buildKeyboard(ctx, screen, position) {
    const keyMat = () => std(0xd9d6e2);
    const kb = addMesh(
        ctx.scene,
        box(0.44, 0.02, 0.15),
        [keyMat(), keyMat(), new THREE.MeshStandardMaterial({ map: keyboardTexture(), roughness: 0.5 }), keyMat(), keyMat(), keyMat()],
        position,
    );
    kb.rotation.x = 0.04;
    const baseY = kb.position.y;
    let press = 0;
    ctx.interactive(kb, {
        key: 'keyboard',
        onClick: () => {
            press = 1;
            screen.burst();
        },
    });
    ctx.animations.push((t, dt) => {
        press = Math.max(0, press - dt / 1.2);
        kb.position.y = baseY - Math.abs(Math.sin(t * 38)) * 0.005 * press;
    });
}

/** Taza. Clic: vapor y un pequeño "sorbo". */
function buildMug(ctx, position) {
    const { scene } = ctx;
    const pos = new THREE.Vector3(...position);
    const mug = group(scene, position);
    addMesh(mug, new THREE.CylinderGeometry(0.04, 0.036, 0.09, 20), std(PINK, { roughness: 0.35 }), [0, 0.045, 0]);
    addMesh(mug, new THREE.TorusGeometry(0.024, 0.007, 8, 16, Math.PI), std(PINK), [0.046, 0.045, 0], { rot: [0, 0, -Math.PI / 2] });
    addMesh(mug, new THREE.CylinderGeometry(0.035, 0.035, 0.002, 20), std(0x2a1a14, { roughness: 0.2 }), [0, 0.082, 0], { shadow: false });

    const puffs = Array.from({ length: 8 }, () => {
        const m = noRaycast(
            new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })),
        );
        m.visible = false;
        scene.add(m);
        return { m, t: 1, delay: 0, dx: 0, dz: 0 };
    });
    let sip = 0;

    ctx.interactive(mug, {
        key: 'mug',
        onClick: () => {
            sip = 1;
            puffs.forEach((p, i) => {
                p.t = 0;
                p.delay = i * 0.11;
                p.dx = (Math.random() - 0.5) * 0.05;
                p.dz = (Math.random() - 0.5) * 0.05;
            });
        },
    });

    ctx.animations.push((t, dt) => {
        sip = Math.max(0, sip - dt / 0.7);
        mug.rotation.z = Math.sin(sip * Math.PI) * 0.35;
        mug.position.y = pos.y + Math.sin(sip * Math.PI) * 0.04;
        puffs.forEach((p) => {
            if (p.t >= 1) {
                p.m.visible = false;
                return;
            }
            if (p.delay > 0) {
                p.delay -= dt;
                return;
            }
            p.t = Math.min(1, p.t + dt / 1.7);
            p.m.visible = true;
            p.m.position.set(pos.x + p.dx * p.t + Math.sin(t * 3 + p.dz * 50) * 0.01, pos.y + 0.1 + p.t * 0.3, pos.z + p.dz * p.t);
            p.m.scale.setScalar(0.6 + p.t * 2);
            p.m.material.opacity = 0.32 * Math.sin(Math.PI * p.t);
        });
    });
}

/** Flexo. Clic: enciende / apaga (luz puntual + foco sobre la mesa + lámpara del techo). */
function buildLamp(ctx, [x, top, z]) {
    const { scene } = ctx;
    const metal = std(0x0e0f1e, { metalness: 0.5, roughness: 0.4 });
    const lamp = group(scene, [x, top, z]);
    addMesh(lamp, new THREE.CylinderGeometry(0.08, 0.09, 0.02, 24), metal, [0, 0.01, 0]);
    addMesh(lamp, new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8), metal, [0.03, 0.2, 0], { rot: [0, 0, -0.18] });
    addMesh(lamp, new THREE.SphereGeometry(0.018, 12, 8), metal, [0.07, 0.385, 0]);
    addMesh(lamp, new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), metal, [0.17, 0.43, 0], { rot: [0, 0, 1.1] });
    const shade = addMesh(
        lamp,
        new THREE.ConeGeometry(0.1, 0.14, 24, 1, true),
        std(PINK, { side: THREE.DoubleSide, roughness: 0.4, emissive: PINK, emissiveIntensity: 0.25 }),
        [0.3, 0.42, 0],
        { rot: [0, 0, 0.35] },
    );
    shade.castShadow = false;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d8, toneMapped: false }));
    bulb.position.set(0.3, 0.38, 0);
    lamp.add(bulb);

    const light = new THREE.PointLight(0xff9cc2, 3, 3, 2);
    light.position.set(x + 0.3, top + 0.39, z + 0.1);
    const pool = new THREE.SpotLight(0xffc4d6, 5, 2.4, 0.75, 0.7, 2);
    pool.position.set(x + 0.3, top + 0.38, z);
    pool.target.position.set(x + 0.55, top, z + 0.3);
    scene.add(light, pool, pool.target);

    ctx.interactive(lamp, { key: 'lamp' });

    const on = new THREE.Color(0xfff0d8);
    const off = new THREE.Color(0x3a3440);
    ctx.animations.push(() => {
        const k = ctx.world.lamp;
        light.intensity = 3 * k;
        pool.intensity = 5 * k;
        bulb.material.color.copy(off).lerp(on, k).multiplyScalar(1 + (ctx.hdr ? 0.7 : 0) * k);
    });
}

/** Figura de astronauta. Clic: salto con pirueta. */
function buildAstronaut(ctx, [x, y, z]) {
    const suit = std(0xf4f2f8, { roughness: 0.5 });
    const g = group(ctx.scene, [x, y, z]);
    g.scale.setScalar(1.9);
    addMesh(g, box(0.06, 0.07, 0.04), suit, [0, 0.075, 0]);
    addMesh(g, box(0.05, 0.06, 0.02), std(0xcfd2e6), [0, 0.08, -0.03]);
    addMesh(g, new THREE.SphereGeometry(0.036, 20, 14), suit, [0, 0.14, 0]);
    const visor = addMesh(g, new THREE.SphereGeometry(0.028, 16, 12), std(0x101428, { metalness: 0.9, roughness: 0.12 }), [0, 0.14, 0.014]);
    visor.scale.set(1, 0.85, 0.8);
    const armL = addMesh(g, box(0.02, 0.055, 0.025), suit, [-0.04, 0.075, 0]);
    addMesh(g, box(0.02, 0.055, 0.025), suit, [0.04, 0.075, 0]);
    addMesh(g, box(0.025, 0.045, 0.03), suit, [-0.017, 0.022, 0]);
    addMesh(g, box(0.025, 0.045, 0.03), suit, [0.017, 0.022, 0]);
    addMesh(g, box(0.02, 0.012, 0.004), new THREE.MeshBasicMaterial({ color: ctx.glow(PINK, 2), toneMapped: false }), [0, 0.09, 0.022], { shadow: false });

    let jump = 1;
    const item = ctx.interactive(g, {
        key: 'astronaut',
        onClick: () => {
            if (jump >= 1) jump = 0;
        },
    });

    ctx.animations.push((t, dt) => {
        let lift = 0;
        let spin = 0;
        if (jump < 1) {
            jump = Math.min(1, jump + dt / 0.95);
            lift = Math.sin(Math.PI * jump) * 0.17;
            spin = easeInOut(jump) * Math.PI * 2;
        }
        g.position.y = y + lift;
        g.rotation.y = -0.3 + Math.sin(t * 0.5) * 0.12 + spin;
        // saluda con el brazo al pasar el cursor
        armL.rotation.z = item.hover() * (2.4 + Math.sin(t * 12) * 0.35);
        armL.position.y = 0.075 + item.hover() * 0.03;
    });
}

/**
 * Muro de la derecha: panel perforado con neón e insignias (Experiencia), una
 * balda de libros debajo (Sobre mí) y el reloj con la hora de Madrid. Todo se
 * construye en coordenadas locales del muro (x a lo largo, z hacia la sala).
 */
function buildFeatureWall(ctx) {
    const wall = group(ctx.scene, [WALL_RIGHT, 0, 1.0], -Math.PI / 2);
    buildPegboard(ctx, group(wall, [0, 2.0, 0]));
    buildShelf(ctx, group(wall, [0, 1.12, 0]));
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
}

/** Balda con libros bajo el panel. Clic: Sobre mí. Al pasar el cursor los libros se asoman. */
function buildShelf(ctx, shelf) {
    const rand = rng(5);
    const palette = [0xff9ebd, 0x7fd6ff, 0xffd29a, 0xb79cff, 0x4ade80, 0xe5e2ee, 0x3b4170];
    const width = 1.7;
    const books = [];
    addMesh(shelf, box(width, 0.035, 0.26), std(0x16171f, { roughness: 0.5 }), [0, 0, 0.13]);
    let x = -width / 2 + 0.06;
    while (x < width / 2 - 0.25) {
        const bw = 0.035 + rand() * 0.035;
        const bh = 0.2 + rand() * 0.13;
        const color = palette[Math.floor(rand() * palette.length)];
        const book = addMesh(shelf, box(bw, bh, 0.2), std(color, { roughness: 0.75 }), [x + bw / 2, 0.018 + bh / 2, 0.12], {
            rot: rand() < 0.1 ? [0, 0, 0.18] : undefined,
        });
        books.push({ mesh: book, baseZ: book.position.z, phase: rand() * Math.PI * 2 });
        x += bw + 0.004;
    }
    // una planta pequeña al final de la balda
    addMesh(shelf, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 14), std(0xe5e2ee), [width / 2 - 0.12, 0.058, 0.13]);
    for (let i = 0; i < 6; i++) {
        const leaf = addMesh(shelf, new THREE.SphereGeometry(0.035, 10, 8), std(0x4ade80, { roughness: 0.6 }), [
            width / 2 - 0.12 + (rand() - 0.5) * 0.07,
            0.16 + rand() * 0.07,
            0.13 + (rand() - 0.5) * 0.07,
        ]);
        leaf.scale.set(0.7, 1.7, 0.7);
    }

    const item = ctx.interactive(shelf, { key: 'books', section: 'about' });
    ctx.animations.push((t) => {
        const hover = item.hover();
        if (hover === 0) return;
        books.forEach((b) => {
            b.mesh.position.z = b.baseZ + hover * (0.02 + Math.max(0, Math.sin(t * 3 + b.phase)) * 0.03);
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
                    m.emissiveIntensity = base * (0.6 + music * 0.6 + level * (ctx.hdr ? 4 : 1.5));
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
    ctx.animations.push(() => {
        const d = world.day;
        const n = world.night;
        hemi.intensity = 0.55 + 0.25 * d - 0.3 * n;
        sky.color.copy(skyDusk).lerp(skyDay, d).lerp(skyNight, n);
        // con lluvia o niebla entra menos luz; los relámpagos la disparan un instante
        sky.intensity = (8 + 2 * d - 4 * n) * (1 - 0.35 * world.rain - 0.25 * world.fog) + ctx.flash * 60;
        key.intensity = 30 + 4 * d - 12 * n;
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
