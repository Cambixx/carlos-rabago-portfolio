import * as THREE from 'three';
import {
    badgeTexture,
    cityTexture,
    dropletsTexture,
    createClock,
    createScreen,
    keyboardTexture,
    lightPatchTexture,
    parquetTexture,
    pegboardTexture,
    posterTexture,
    rng,
    roundSprite,
    rainTexture,
    rugTexture,
    snowTexture,
    wallTexture,
} from './textures';
import { makeInteractive, noRaycast } from './interactive';
import { MODELS, loadModel } from './models';
import { getContent } from '../content';
import { STRINGS } from '../i18n/strings';

const PINK = 0xff9ebd;
const WARM = 0xffd29a;
const BADGE_ACCENTS = ['#ff9ebd', '#7fd6ff', '#b79cff', '#ffd29a', '#4ade80'];

/** Medidas de la sala (metros). El fondo está en z = -ROOM.back. */
const ROOM = { halfWidth: 3.4, back: 3.4, front: 3.4, height: 3 };
const DESK_Z = -2.85;

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

function group(parent, [x, y, z] = [0, 0, 0]) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
}

/**
 * Construye la habitación. Devuelve:
 * - `scene`
 * - `hotspots`: los rombos de sección (para las etiquetas flotantes)
 * - `update(time, dt, { musicLevel })`: animaciones y transiciones
 * - `apply({ lamp, night, music })`: estado de la sala que controla la app
 *
 * Los objetos clicables se encuentran por raycast a través de `userData.item`.
 */
export function buildRoom({ lowPower = false, lang = 'es' } = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d17);
    scene.fog = new THREE.Fog(0x0b0d17, 7, 16);

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
    });

    const backZ = -ROOM.back;
    buildShell(ctx, backZ);
    buildWindow(ctx, backZ);
    buildPegboard(ctx, backZ);
    buildDesk(ctx);
    buildShelves(ctx);
    buildDecor(ctx, backZ);
    buildSpeakers(ctx, backZ);
    buildPlant(ctx, backZ);
    buildStringLights(ctx);
    buildClock(ctx);
    buildDust(ctx);
    buildLights(ctx);

    // Rombos rosas que flotan sobre cada zona: atajos a cada sección.
    [
        { id: 'projects', num: '01', at: [-0.5, 1.82, -3.0] },
        { id: 'experience', num: '02', at: [1.75, 2.42, -3.2] },
        { id: 'about', num: '03', at: [-0.3, 2.62, -3.2] },
        { id: 'contact', num: '04', at: [0.75, 1.32, -2.85] },
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

    // los modelos que cargan después no deben añadirse a una escena ya desmontada
    const dispose = () => {
        ctx.disposed = true;
    };

    return { scene, hotspots: ctx.hotspots, screen: ctx.screenAnchor, update, apply, dispose };
}

function buildShell({ scene, animations, world }, backZ) {
    const { halfWidth, front, height } = ROOM;
    const depth = front + -backZ;
    const centerZ = (front + backZ) / 2;

    addMesh(scene, new THREE.PlaneGeometry(halfWidth * 2, depth), std(0xffffff, { map: parquetTexture(), roughness: 0.55 }), [0, 0, centerZ], {
        shadow: false,
        rot: [-Math.PI / 2, 0, 0],
    });
    addMesh(scene, new THREE.PlaneGeometry(halfWidth * 2, height), std(0xffffff, { map: wallTexture(5, 1), roughness: 0.9 }), [0, height / 2, backZ], {
        shadow: false,
    });
    const sideMat = () => std(0xffffff, { map: wallTexture(5, 1), roughness: 0.9 });
    addMesh(scene, new THREE.PlaneGeometry(depth, height), sideMat(), [-halfWidth, height / 2, centerZ], { shadow: false, rot: [0, Math.PI / 2, 0] });
    addMesh(scene, new THREE.PlaneGeometry(depth, height), sideMat(), [halfWidth, height / 2, centerZ], { shadow: false, rot: [0, -Math.PI / 2, 0] });
    addMesh(scene, new THREE.PlaneGeometry(halfWidth * 2, depth), std(0x12142a), [0, height, centerZ], { shadow: false, rot: [Math.PI / 2, 0, 0] });
    addMesh(scene, box(halfWidth * 2, 0.09, 0.03), std(0x0c0d1b), [0, 0.045, backZ + 0.015], { shadow: false });

    // mancha de luz de la ventana sobre el suelo: rosa al atardecer, azul de noche
    const patch = noRaycast(
        new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, 2.2),
            new THREE.MeshBasicMaterial({
                map: lightPatchTexture(),
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            }),
        ),
    );
    patch.rotation.set(-Math.PI / 2, 0, 0.35);
    patch.position.set(-0.1, 0.012, -1.3);
    scene.add(patch);
    const duskTint = new THREE.Color(0xffbec8);
    const dayTint = new THREE.Color(0xfff2dc);
    const nightTint = new THREE.Color(0x9fb0ff);
    animations.push(() => {
        patch.material.color.copy(duskTint).lerp(dayTint, world.day).lerp(nightTint, world.night);
        patch.material.opacity = (0.22 + world.day * 0.12 - world.night * 0.07) * (1 - world.fog * 0.5);
    });

    addMesh(scene, new THREE.PlaneGeometry(3.6, 2.4), std(0xffffff, { map: rugTexture(), roughness: 1 }), [-0.45, 0.008, -1.7], {
        shadow: false,
        rot: [-Math.PI / 2, 0, 0],
    });
}

/** Ventana con fundido atardecer ↔ noche. Clic: cambia la hora. */
function buildWindow(ctx, backZ) {
    const cx = -0.3;
    const cy = 1.7;
    const w = 1.5;
    const h = 1.3;
    const z = backZ + 0.012;
    const win = group(ctx.scene);

    const dusk = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: cityTexture('dusk'), color: ctx.glow(0xffffff, 1.25), toneMapped: false }));
    dusk.position.set(cx, cy, z);
    const night = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: cityTexture('night'), color: ctx.glow(0xffffff, 1.25), toneMapped: false, transparent: true, opacity: 0 }),
    );
    night.position.set(cx, cy, z + 0.002);
    const day = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: cityTexture('day'), color: ctx.glow(0xffffff, 1.25), toneMapped: false, transparent: true, opacity: 0 }),
    );
    day.position.set(cx, cy, z + 0.001);

    // Tiempo real de Madrid: niebla/nubes, lluvia que cae, gotas en el cristal y nieve.
    const layer = (material, dz) => {
        const mesh = noRaycast(new THREE.Mesh(new THREE.PlaneGeometry(w, h), material));
        mesh.position.set(cx, cy, z + dz);
        return mesh;
    };
    const veil = { transparent: true, opacity: 0, depthWrite: false, toneMapped: false };
    const haze = layer(new THREE.MeshBasicMaterial({ color: 0xb8c2d8, ...veil }), 0.003);
    const rainTex = rainTexture();
    const rain = layer(new THREE.MeshBasicMaterial({ map: rainTex, ...veil }), 0.004);
    const drops = layer(new THREE.MeshBasicMaterial({ map: dropletsTexture(), ...veil }), 0.005);
    const snowTex = snowTexture();
    const snow = layer(new THREE.MeshBasicMaterial({ map: snowTex, ...veil }), 0.006);
    win.add(dusk, day, night, haze, rain, drops, snow);

    const frame = std(0x090a14, { roughness: 0.5 });
    const t = 0.07;
    const d = 0.09;
    addMesh(win, box(w + t * 2, t, d), frame, [cx, cy + h / 2 + t / 2, z + d / 2]);
    addMesh(win, box(w + t * 2, t, d), frame, [cx, cy - h / 2 - t / 2, z + d / 2]);
    addMesh(win, box(t, h, d), frame, [cx - w / 2 - t / 2, cy, z + d / 2]);
    addMesh(win, box(t, h, d), frame, [cx + w / 2 + t / 2, cy, z + d / 2]);
    addMesh(win, box(0.045, h, d * 0.8), frame, [cx, cy, z + d / 2]);
    addMesh(win, box(w, 0.045, d * 0.8), frame, [cx, cy + 0.12, z + d / 2]);
    addMesh(win, box(w + 0.3, 0.04, 0.2), std(0x1c1f36), [cx, cy - h / 2 - t - 0.02, z + 0.1]);

    ctx.interactive(win, { key: 'window' });
    // las nubes/niebla toman el color del cielo: claras de día, malva al atardecer, azul oscuro de noche
    const hazeDusk = new THREE.Color(0x9a8aa8);
    const hazeDay = new THREE.Color(0xd5dde8);
    const hazeNight = new THREE.Color(0x2c3150);
    const hazeFlash = new THREE.Color(0xffffff);
    ctx.animations.push((t, dt) => {
        const W = ctx.world;
        day.material.opacity = W.day;
        night.material.opacity = W.night;
        rainTex.offset.y += dt * 1.7;
        rain.material.opacity = W.rain * 0.85;
        drops.material.opacity = W.rain * 0.7;
        snowTex.offset.y += dt * 0.12;
        snowTex.offset.x = Math.sin(t * 0.4) * 0.05;
        snow.material.opacity = W.snow;
        // tormenta: de vez en cuando, un relámpago que se apaga en décimas de segundo
        if (ctx.storm && Math.random() < dt * 0.15) ctx.flash = 1;
        ctx.flash *= Math.exp(-dt * 7);
        haze.material.color.copy(hazeDusk).lerp(hazeDay, W.day).lerp(hazeNight, W.night).lerp(hazeFlash, ctx.flash);
        haze.material.opacity = W.fog * 0.5 + ctx.flash * 0.55;
    });
}

function buildPegboard(ctx, backZ) {
    const { scene, animations } = ctx;
    const cx = 1.75;
    const cy = 1.78;
    const w = 1.9;
    const h = 0.86;
    const z = backZ + 0.015;

    addMesh(scene, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 }), [cx, cy, z], { shadow: false });

    const glow = new THREE.MeshBasicMaterial({ color: ctx.glow(PINK, 2.6), toneMapped: false });
    const e = 0.012;
    addMesh(scene, box(w + e * 2, e, e * 2), glow, [cx, cy + h / 2, z + 0.006], { shadow: false });
    addMesh(scene, box(w + e * 2, e, e * 2), glow, [cx, cy - h / 2, z + 0.006], { shadow: false });
    addMesh(scene, box(e, h, e * 2), glow, [cx - w / 2, cy, z + 0.006], { shadow: false });
    addMesh(scene, box(e, h, e * 2), glow, [cx + w / 2, cy, z + 0.006], { shadow: false });

    // Una insignia por empleo, la más reciente a la izquierda. Clic: abre ese empleo.
    const jobs = ctx.c.experience.items.slice(0, 5);
    const spacing = w / (jobs.length + 0.35);
    jobs.forEach((job, i) => {
        const hookX = cx - w / 2 + spacing * (i + 0.85);
        const pivot = group(scene, [hookX, cy + h / 2 - 0.1, z + 0.03]);
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
        animations.push((t) => {
            const hover = item.hover();
            pivot.rotation.z = Math.sin(t * (0.9 + hover * 2.5) + phase) * (0.035 + hover * 0.05);
            pivot.position.z = baseZ + hover * 0.05;
            card.scale.setScalar(1 + hover * 0.08);
        });
    });

    [
        [0.78, 0.2, 0xffd29a],
        [0.78, -0.02, 0x7fd6ff],
        [0.62, 0.05, 0xff9ebd],
    ].forEach(([dx, dy, color]) => {
        addMesh(scene, new THREE.TorusGeometry(0.03, 0.006, 8, 20), std(color, { metalness: 0.4 }), [cx + dx - 0.06, cy + dy, z + 0.03], { shadow: false });
    });

    const light = new THREE.PointLight(PINK, 2.2, 3.2, 2);
    light.position.set(cx, cy, z + 0.9);
    scene.add(light);
}

function buildDesk(ctx) {
    const { scene } = ctx;
    const wood = std(0x1b1d33, { roughness: 0.45 });
    const dark = std(0x0e0f1e, { roughness: 0.6 });

    addMesh(scene, box(2.5, 0.06, 1.05), std(0x20233d, { roughness: 0.35, metalness: 0.15 }), [-0.5, 0.76, DESK_Z]);
    addMesh(scene, box(2.4, 0.6, 0.03), wood, [-0.5, 0.45, DESK_Z + 0.5]);
    addMesh(scene, box(0.5, 0.7, 0.92), wood, [0.45, 0.4, DESK_Z]);
    addMesh(scene, box(0.04, 0.72, 0.92), dark, [-1.65, 0.38, DESK_Z]);
    addMesh(scene, box(0.16, 0.015, 0.012), std(0xcfd2e6, { metalness: 0.8, roughness: 0.3 }), [0.45, 0.62, DESK_Z + 0.47], { shadow: false });
    addMesh(scene, box(2.5, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: ctx.glow(WARM, 2.2), toneMapped: false }), [-0.5, 0.752, DESK_Z + 0.527], { shadow: false });
    addMesh(scene, box(0.8, 0.004, 0.3), std(0x12142a), [-0.5, 0.793, DESK_Z + 0.22]);
    const mouse = addMesh(scene, new THREE.SphereGeometry(0.03, 16, 12), std(0xf4f2f8, { roughness: 0.4 }), [-0.17, 0.81, DESK_Z + 0.22]);
    mouse.scale.set(0.9, 0.5, 1.4);
    addMesh(scene, box(0.075, 0.008, 0.155), std(0x07080f, { roughness: 0.25, metalness: 0.4 }), [0.32, 0.795, DESK_Z + 0.26], { rot: [0, 0.5, 0] });
    addMesh(scene, box(0.2, 0.014, 0.28), std(0xffd29a, { roughness: 0.8 }), [-1.35, 0.797, DESK_Z + 0.2], { rot: [0, -0.3, 0] });

    const screen = buildMonitor(ctx);
    buildKeyboard(ctx, screen);
    buildMug(ctx);
    buildLamp(ctx, -1.5, DESK_Z - 0.15);
    buildAstronaut(ctx, 0.75, 0.79, DESK_Z - 0.1);
    // La silla queda a un lado para no tapar el monitor desde la cámara.
    buildChair(ctx, -1.75, -1.95, 1.0);
}

/** Monitor con terminal animado. Clic: Proyectos. */
function buildMonitor(ctx) {
    const mx = -0.5;
    const mz = DESK_Z - 0.15;
    const dark = std(0x0e0f1e, { roughness: 0.6 });
    const monitor = group(ctx.scene);
    addMesh(monitor, box(1.08, 0.64, 0.04), dark, [mx, 1.2, mz]);
    const screen = createScreen(ctx.t.scene.screen);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.56), new THREE.MeshBasicMaterial({ map: screen.texture, color: ctx.glow(0xffffff, 1.15), toneMapped: false }));
    panel.position.set(mx, 1.2, mz + 0.0215);
    monitor.add(panel);
    addMesh(monitor, box(0.06, 0.34, 0.03), dark, [mx, 0.95, mz - 0.01]);
    addMesh(monitor, box(0.34, 0.012, 0.22), dark, [mx, 0.796, mz + 0.04]);

    const item = ctx.interactive(monitor, { key: 'monitor', section: 'projects' });

    const glow = new THREE.PointLight(0xa0b4ff, 3.5, 2.6, 2);
    glow.position.set(mx, 1.2, mz + 0.5);
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
function buildKeyboard(ctx, screen) {
    const keyMat = () => std(0xd9d6e2);
    const kb = addMesh(
        ctx.scene,
        box(0.44, 0.02, 0.15),
        [keyMat(), keyMat(), new THREE.MeshStandardMaterial({ map: keyboardTexture(), roughness: 0.5 }), keyMat(), keyMat(), keyMat()],
        [-0.55, 0.805, DESK_Z + 0.22],
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
function buildMug(ctx) {
    const { scene } = ctx;
    const pos = new THREE.Vector3(0.18, 0.79, DESK_Z + 0.12);
    const mug = group(scene, pos.toArray());
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

/** Flexo. Clic: enciende / apaga (luz puntual + foco sobre la mesa). */
function buildLamp(ctx, x, z) {
    const { scene } = ctx;
    const metal = std(0x0e0f1e, { metalness: 0.5, roughness: 0.4 });
    const lamp = group(scene, [x, 0.79, z]);
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
    light.position.set(x + 0.3, 1.18, z + 0.1);
    const pool = new THREE.SpotLight(0xffc4d6, 5, 2.4, 0.75, 0.7, 2);
    pool.position.set(x + 0.3, 1.17, z);
    pool.target.position.set(x + 0.55, 0.76, z + 0.3);
    scene.add(light, pool, pool.target);

    ctx.interactive(lamp, { key: 'lamp' });

    const on = new THREE.Color(0xfff0d8);
    const off = new THREE.Color(0x3a3440);
    ctx.animations.push(() => {
        const k = ctx.world.lamp;
        light.intensity = 3 * k;
        pool.intensity = 5 * k;
        bulb.material.color.copy(off).lerp(on, k).multiplyScalar(1 + (ctx.hdr ? 1.4 : 0) * k);
    });
}

/** Figura de astronauta. Clic: salto con pirueta. */
function buildAstronaut(ctx, x, y, z) {
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

/** Silla de oficina. Clic: gira con inercia. */
function buildChair(ctx, x, z, rotationY) {
    const fabric = std(0x2b2e52, { roughness: 0.85 });
    const metal = std(0x0b0c18, { metalness: 0.6, roughness: 0.35 });
    const chair = group(ctx.scene, [x, 0, z]);
    chair.rotation.y = rotationY;
    // la parte de arriba gira sobre la base, como una silla de verdad
    const top = group(chair);

    addMesh(top, box(0.52, 0.07, 0.5), fabric, [0, 0.5, 0]);
    const back = addMesh(top, box(0.5, 0.58, 0.07), fabric, [0, 0.86, 0.26], { rot: [-0.12, 0, 0] });
    addMesh(back, box(0.3, 0.04, 0.075), std(PINK, { roughness: 0.5 }), [0, 0.2, 0], { shadow: false });
    addMesh(top, box(0.04, 0.2, 0.3), metal, [-0.3, 0.64, 0.02]);
    addMesh(top, box(0.04, 0.2, 0.3), metal, [0.3, 0.64, 0.02]);
    addMesh(chair, new THREE.CylinderGeometry(0.03, 0.03, 0.34, 12), metal, [0, 0.29, 0]);
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        addMesh(chair, box(0.36, 0.03, 0.045), metal, [Math.cos(a) * 0.18, 0.09, Math.sin(a) * 0.18], { rot: [0, -a, 0] });
        addMesh(chair, new THREE.SphereGeometry(0.03, 10, 8), metal, [Math.cos(a) * 0.35, 0.04, Math.sin(a) * 0.35]);
    }

    let velocity = 0;
    ctx.interactive(chair, {
        key: 'chair',
        onClick: () => {
            velocity += 9;
        },
    });
    ctx.animations.push((t, dt) => {
        top.rotation.y += velocity * dt;
        velocity *= Math.exp(-dt * 1.4);
    });
}

/** Baldas con libros. Clic: Sobre mí. Al pasar el cursor los libros se asoman. */
function buildShelves(ctx) {
    const wood = std(0x1b1d33, { roughness: 0.5 });
    const rand = rng(5);
    const x = -ROOM.halfWidth + 0.14;
    const palette = [0xff9ebd, 0x7fd6ff, 0xffd29a, 0xb79cff, 0x4ade80, 0xe5e2ee, 0x3b4170];
    const shelves = group(ctx.scene);
    const books = [];

    [1.28, 1.9].forEach((y, si) => {
        addMesh(shelves, box(0.28, 0.035, 1.5), wood, [x, y, -2.45]);
        let z = -3.12;
        while (z < -1.85) {
            const bw = 0.035 + rand() * 0.035;
            const bh = 0.2 + rand() * 0.13;
            const leaning = rand() < 0.12;
            const color = palette[Math.floor(rand() * palette.length)];
            const book = addMesh(shelves, box(0.2, bh, bw), std(color, { roughness: 0.75 }), [x, y + 0.018 + bh / 2, z + bw / 2], {
                rot: leaning ? [0.25, 0, 0] : undefined,
            });
            books.push({ mesh: book, baseX: book.position.x, phase: rand() * Math.PI * 2 });
            z += bw + 0.004;
            if (si === 1 && z > -2.2) break;
        }
    });
    addMesh(shelves, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 14), std(0xe5e2ee), [x, 1.96, -1.95]);
    for (let i = 0; i < 6; i++) {
        const leaf = addMesh(shelves, new THREE.SphereGeometry(0.035, 10, 8), std(0x4ade80, { roughness: 0.6 }), [
            x + (rand() - 0.5) * 0.07,
            2.06 + rand() * 0.07,
            -1.95 + (rand() - 0.5) * 0.07,
        ]);
        leaf.scale.set(0.7, 1.7, 0.7);
    }

    const item = ctx.interactive(shelves, { key: 'books', section: 'about' });
    ctx.animations.push((t) => {
        const hover = item.hover();
        if (hover === 0) return;
        books.forEach((b) => {
            b.mesh.position.x = b.baseX + hover * (0.02 + Math.max(0, Math.sin(t * 3 + b.phase)) * 0.03);
        });
    });
}

function buildDecor({ scene }, backZ) {
    const poster = (x, y, w, h) => {
        addMesh(scene, box(w + 0.05, h + 0.05, 0.03), std(0x090a14), [x, y, backZ + 0.02], { shadow: false });
        addMesh(scene, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 0.6 }), [x, y, backZ + 0.04], {
            shadow: false,
        });
    };
    poster(-2.3, 1.95, 0.6, 0.8);
    poster(-1.55, 1.75, 0.34, 0.46);
    addMesh(scene, box(1.15, 0.7, 0.42), std(0x14162b, { roughness: 0.55 }), [2.0, 0.35, backZ + 0.25]);
}

/**
 * Altavoces. Clic: música generativa. Se pintan primero con geometría simple y,
 * cuando termina de cargar el modelo .glb (MODELS.speaker), se sustituyen por él:
 * las piezas simples quedan invisibles pero siguen sirviendo de zona de clic,
 * que es mucho más barato que hacer raycast contra miles de triángulos.
 */
function buildSpeakers(ctx, backZ) {
    const speakers = group(ctx.scene);
    const units = [];
    [
        { x: 1.65, toeIn: 0.22 },
        { x: 2.35, toeIn: -0.22 },
    ].forEach(({ x, toeIn }) => {
        const spk = group(speakers, [x, 0.7, backZ + 0.25]);
        spk.rotation.y = toeIn; // girados hacia el centro, como monitores de estudio
        addMesh(spk, box(0.22, 0.34, 0.2), std(0x0c0d1b, { roughness: 0.6 }), [0, 0.17, 0]);
        const woofer = group(spk, [0, 0.11, 0.1]);
        addMesh(woofer, new THREE.TorusGeometry(0.06, 0.012, 8, 24), std(0xcfd2e6, { metalness: 0.7, roughness: 0.3 }), [0, 0, 0]);
        addMesh(woofer, new THREE.CircleGeometry(0.05, 20), std(0x1b1d33), [0, 0, 0.002], { shadow: false });
        addMesh(spk, new THREE.TorusGeometry(0.025, 0.008, 8, 18), std(0xcfd2e6, { metalness: 0.7, roughness: 0.3 }), [0, 0.26, 0.1]);
        const led = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0x2a2d40, toneMapped: false }));
        led.position.set(0.08, 0.31, 0.101);
        led.userData.noTint = true;
        spk.add(led);
        units.push({ spk, woofer, led, model: null, glow: [] });
    });

    const item = ctx.interactive(speakers, { key: 'speakers' });

    loadModel(MODELS.speaker.url)
        .then((model) => {
            if (ctx.disposed) return;
            // normalizar: altura fija, apoyado en el suelo del mueble y centrado
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const scale = MODELS.speaker.height / size.y;
            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
            const template = new THREE.Group();
            template.add(model);

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

/** Planta grande. Clic: las hojas se agitan. */
function buildPlant(ctx, backZ) {
    const rand = rng(9);
    const plant = group(ctx.scene);
    addMesh(plant, new THREE.CylinderGeometry(0.2, 0.15, 0.36, 20), std(0xe5e2ee, { roughness: 0.6 }), [2.95, 0.18, backZ + 0.45]);
    const leaves = [];
    for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2;
        const leaf = addMesh(
            plant,
            new THREE.SphereGeometry(0.1, 12, 10),
            std(new THREE.Color().setHSL(0.36 + rand() * 0.04, 0.55, 0.22 + rand() * 0.08), { roughness: 0.6 }),
            [2.95 + Math.cos(a) * 0.15, 0.7 + rand() * 0.5, backZ + 0.45 + Math.sin(a) * 0.15],
            { rot: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5] },
        );
        leaf.scale.set(0.45, 2.6 + rand() * 1.2, 0.18);
        leaves.push({ leaf, x: leaf.rotation.x, z: leaf.rotation.z, i });
    }

    let rustle = 0;
    ctx.interactive(plant, {
        key: 'plant',
        onClick: () => {
            rustle = 1;
        },
    });
    ctx.animations.push((t, dt) => {
        rustle *= Math.exp(-dt * 1.6);
        leaves.forEach(({ leaf, x, z, i }) => {
            const idle = Math.sin(t * 0.8 + i) * 0.02;
            leaf.rotation.x = x + idle + Math.sin(t * 13 + i * 1.7) * 0.14 * rustle;
            leaf.rotation.z = z + idle + Math.cos(t * 11 + i * 2.3) * 0.14 * rustle;
        });
    });
}

/** Guirnalda en la pared izquierda: cada bombilla titila a su ritmo. */
function buildStringLights(ctx) {
    const { scene } = ctx;
    const points = [];
    const count = 22;
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const z = THREE.MathUtils.lerp(-3.3, 1.2, t);
        // festones: una caída general y cuatro arcos pequeños
        const y = 2.55 - 0.12 * Math.sin(t * Math.PI) - Math.abs(Math.sin(t * Math.PI * 4)) * 0.08;
        points.push(new THREE.Vector3(-ROOM.halfWidth + 0.03, y, z));
    }
    scene.add(noRaycast(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x05060d }))));

    const bulbs = [];
    points.forEach((p, i) => {
        if (i % 2) return;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe3b0, toneMapped: false }));
        bulb.position.copy(p).add(new THREE.Vector3(0.02, -0.03, 0));
        scene.add(bulb);
        bulbs.push(bulb);
    });
    const warm = new THREE.PointLight(0xffc98a, 5, 4.5, 2);
    warm.position.set(-2.8, 2.35, -1.5);
    scene.add(warm);

    ctx.animations.push((t) => {
        bulbs.forEach((b, i) => {
            const f = 0.72 + 0.28 * Math.sin(t * (1.3 + (i % 3) * 0.6) + i * 1.9);
            b.material.color.setRGB(f, 0.89 * f, 0.69 * f).multiplyScalar(ctx.hdr ? 2.4 : 1);
        });
        warm.intensity = 5 + ctx.world.night * 2 + Math.sin(t * 1.7) * 0.3;
    });
}

/** Reloj de pared con la hora real de Madrid (pared izquierda: hay que girarse para verlo). */
function buildClock(ctx) {
    const clock = createClock(ctx.t.scene.clock);
    const g = group(ctx.scene, [-ROOM.halfWidth + 0.03, 1.95, -1.3]);
    g.rotation.y = Math.PI / 2;
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

/** Motas de polvo flotando en la luz de la ventana. */
function buildDust(ctx) {
    const rand = rng(3);
    const count = ctx.lowPower ? 90 : 180;
    const base = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        base[i * 3] = -1.8 + rand() * 3.0;
        base[i * 3 + 1] = 0.3 + rand() * 2.3;
        base[i * 3 + 2] = -3.2 + rand() * 2.6;
        seeds[i] = rand();
    }
    const positions = base.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.016,
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

function buildLights(ctx) {
    const { scene, world } = ctx;
    const hemi = new THREE.HemisphereLight(0x5f6cc0, 0x15132a, 0.95);
    scene.add(hemi);

    const key = new THREE.SpotLight(0xb8c4ff, 42, 14, 0.9, 0.85, 2);
    key.position.set(1.4, 2.9, 0.4);
    key.target.position.set(-0.5, 0.7, -2.4);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(ctx.lowPower ? 512 : 1024);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    scene.add(key, key.target);

    // luz que entra por la ventana: atardecer rosado o luna azulada
    const sky = new THREE.PointLight(0xd890a8, 5, 7, 2);
    sky.position.set(-0.3, 1.8, -2.6);
    scene.add(sky);

    const hemiDusk = new THREE.Color(0x5f6cc0);
    const hemiDay = new THREE.Color(0x9cb0e0);
    const hemiNight = new THREE.Color(0x34408c);
    const skyDusk = new THREE.Color(0xd890a8);
    const skyDay = new THREE.Color(0xe8eeff);
    const skyNight = new THREE.Color(0x7f8cff);
    ctx.animations.push(() => {
        const d = world.day;
        const n = world.night;
        hemi.color.copy(hemiDusk).lerp(hemiDay, d).lerp(hemiNight, n);
        hemi.intensity = 0.95 + 0.4 * d - 0.4 * n - (1 - world.lamp) * 0.15;
        sky.color.copy(skyDusk).lerp(skyDay, d).lerp(skyNight, n);
        // con lluvia o niebla entra menos luz; los relámpagos la disparan un instante
        // de día la luz directa sube poco: más quemaría los objetos blancos cercanos (bloom)
        sky.intensity = (5 + 2 * d - 1.8 * n) * (1 - 0.35 * world.rain - 0.25 * world.fog) + ctx.flash * 40;
        key.intensity = 42 + 5 * d - 16 * n;
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
