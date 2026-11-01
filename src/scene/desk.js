import * as THREE from 'three';
import { createScreen } from './textures';
import { noRaycast } from './interactive';
import { PINK, addMesh, box, eachMaterial, easeInOut, group, rounded, std } from './helpers';

/**
 * Todo lo que hay sobre la mesa. Donde existe un modelo realista (flexo y
 * material de escritorio, de Poly Haven) se usa; el resto se modela aquí con
 * aristas redondeadas y materiales físicos (aluminio, cristal, cerámica) para
 * que no desentone con la oficina. `ctx.reflect(material)` les da reflejos.
 */
export function buildDesk(ctx, { top, back, models }) {
    const { scene } = ctx;
    const felt = std(0x16171d, { roughness: 0.95 });
    addMesh(scene, rounded(0.82, 0.003, 0.3, 0.0015, 2), felt, [0.05, top + 0.0015, -0.9]);

    const mouse = addMesh(
        scene,
        new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        ctx.reflect(std(0xd9d9de, { roughness: 0.32 }), 0.4),
        [0.34, top + 0.003, -0.9],
    );
    mouse.scale.set(0.06, 0.034, 0.105);

    buildPhone(ctx, [0.9, top, -0.82]);
    buildNotebook(ctx, [-0.95, top, -0.86]);
    if (models.stationery) {
        const stationery = models.stationery;
        stationery.position.set(-0.52, top, -0.94);
        stationery.rotation.y = 0.35;
        eachMaterial(stationery, (m, mesh) => {
            mesh.castShadow = true;
            ctx.reflect(m, 0.4);
        });
        scene.add(stationery);
    }

    const screen = buildMonitor(ctx, [0, top, -1.25]);
    buildKeyboard(ctx, screen, [0, top, -0.9]);
    buildMug(ctx, [0.58, top, -0.86]);
    buildLamp(ctx, [-1.12, top, back + 0.02], models.lamp);
    buildAstronaut(ctx, [1.08, top, -1.12]);
}

/** Monitor de marco fino y pie de aluminio, con terminal animado. Clic: Proyectos. */
function buildMonitor(ctx, [mx, top, mz]) {
    const my = top + 0.44;
    const bezel = std(0x0b0b0f, { roughness: 0.42, metalness: 0.25 });
    const aluminium = ctx.reflect(std(0xb9bdc7, { roughness: 0.3, metalness: 0.9 }), 0.8);
    const monitor = group(ctx.scene);

    addMesh(monitor, rounded(1.03, 0.605, 0.022, 0.008), bezel, [mx, my - 0.01, mz]);
    addMesh(monitor, rounded(0.62, 0.36, 0.034, 0.03), bezel, [mx, my - 0.03, mz - 0.024]);
    addMesh(monitor, rounded(0.07, 0.36, 0.018, 0.007), aluminium, [mx, top + 0.2, mz - 0.075], { rot: [-0.14, 0, 0] });
    addMesh(monitor, rounded(0.27, 0.01, 0.21, 0.005), aluminium, [mx, top + 0.005, mz - 0.04]);

    const screen = createScreen(ctx.t.scene.screen);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.56), new THREE.MeshBasicMaterial({ map: screen.texture, color: ctx.glow(0xffffff, 1.15), toneMapped: false }));
    panel.position.set(mx, my, mz + 0.0115);
    monitor.add(panel);

    const item = ctx.interactive(monitor, { key: 'monitor', section: 'projects' });

    const glow = new THREE.PointLight(0xa0b4ff, 2.2, 2.6, 2);
    glow.position.set(mx, my, mz + 0.5);
    ctx.scene.add(glow);
    ctx.animations.push((t, dt) => {
        screen.update(dt);
        glow.intensity = (2.2 + Math.sin(t * 2.3) * 0.1 + item.hover() * 1.5) * ctx.wake.monitor;
        panel.material.opacity = ctx.wake.monitor;
    });
    panel.material.transparent = true;
    // Dónde va la pantalla HTML real (CSS3D) en la sección Proyectos.
    ctx.screenAnchor = { center: panel.position.clone(), width: 1.0, height: 0.56 };
    return screen;
}

/** Teclado de aluminio con teclas individuales. Clic: las teclas se hunden y el monitor teclea. */
function buildKeyboard(ctx, screen, [x, top, z]) {
    const kb = group(ctx.scene, [x, top, z]);
    kb.rotation.x = 0.03;
    const aluminium = ctx.reflect(std(0xc4c7cf, { roughness: 0.32, metalness: 0.85 }), 0.7);
    addMesh(kb, rounded(0.44, 0.011, 0.135, 0.005), aluminium, [0, 0.0055, 0]);

    // filas: 4 de teclas normales y la de abajo con la barra espaciadora
    const pitch = 0.0198;
    const layout = [
        { n: 14, y: -2 },
        { n: 14, y: -1 },
        { n: 13, y: 0 },
        { n: 12, y: 1 },
    ];
    const keys = [];
    layout.forEach(({ n, y }) => {
        for (let i = 0; i < n; i++) keys.push({ x: (i - (n - 1) / 2) * pitch, z: y * pitch, w: 1 });
    });
    [-3, -2, -1].forEach((i) => keys.push({ x: (i - 2.8) * pitch, z: 2 * pitch, w: 1 }));
    keys.push({ x: 0, z: 2 * pitch, w: 6.2 });
    [1, 2, 3].forEach((i) => keys.push({ x: (i + 2.8) * pitch, z: 2 * pitch, w: 1 }));

    const keycaps = new THREE.InstancedMesh(rounded(0.0168, 0.006, 0.0168, 0.0025, 2), std(0xd6d6dc, { roughness: 0.6 }), keys.length);
    const m = new THREE.Matrix4();
    keys.forEach((k, i) => {
        m.makeScale(k.w, 1, 1).setPosition(k.x, 0.013, k.z);
        keycaps.setMatrixAt(i, m);
        // la tecla de arriba a la derecha, rosa: el único guiño de color
        keycaps.setColorAt(i, new THREE.Color(i === 13 ? PINK : 0xffffff));
    });
    keycaps.castShadow = true;
    keycaps.receiveShadow = true;
    kb.add(keycaps);

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
        keycaps.position.y = -Math.abs(Math.sin(t * 38)) * 0.003 * press;
    });
}

function buildPhone(ctx, [x, top, z]) {
    const phone = group(ctx.scene, [x, top, z], 0.5);
    addMesh(phone, rounded(0.072, 0.008, 0.15, 0.0035), ctx.reflect(std(0x07080c, { roughness: 0.1, metalness: 0.35 }), 1), [0, 0.004, 0]);
}

/** Libreta tipo Moleskine: tapa oscura, cantos de papel y goma rosa. */
function buildNotebook(ctx, [x, top, z]) {
    const notebook = group(ctx.scene, [x, top, z], -0.3);
    addMesh(notebook, rounded(0.15, 0.016, 0.21, 0.004), std(0x1c1d22, { roughness: 0.8 }), [0, 0.008, 0]);
    addMesh(notebook, box(0.145, 0.011, 0.203), std(0xefe9dc, { roughness: 0.9 }), [0.004, 0.008, 0], { shadow: false });
    addMesh(notebook, box(0.006, 0.0172, 0.212), std(PINK, { roughness: 0.6 }), [0.055, 0.008, 0], { shadow: false });
}

/** Taza de cerámica con grosor (torneada a partir de un perfil). Clic: vapor y un sorbo. */
function buildMug(ctx, position) {
    const { scene } = ctx;
    const pos = new THREE.Vector3(...position);
    const mug = group(scene, position);
    const profile = [
        [0, 0],
        [0.034, 0],
        [0.038, 0.004],
        [0.04, 0.09],
        [0.0385, 0.095],
        [0.0355, 0.093],
        [0.0345, 0.012],
        [0, 0.012],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const ceramic = ctx.reflect(std(PINK, { roughness: 0.32 }), 0.5);
    addMesh(mug, new THREE.LatheGeometry(profile, 40), ceramic, [0, 0, 0]);
    addMesh(mug, new THREE.TorusGeometry(0.025, 0.0075, 12, 24, Math.PI), ceramic, [0.04, 0.048, 0], { rot: [0, 0, -Math.PI / 2] });
    addMesh(mug, new THREE.CircleGeometry(0.0345, 32), std(0x2a1a14, { roughness: 0.15 }), [0, 0.078, 0], { shadow: false, rot: [-Math.PI / 2, 0, 0] });

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

/**
 * Flexo de brazo con pinza (modelo de Poly Haven, oscurecido a negro mate) sujeto
 * al borde trasero de la mesa. Si el modelo no carga, uno sencillo. Clic: enciende
 * / apaga (luz puntual, foco sobre la mesa y la lámpara del techo).
 */
function buildLamp(ctx, [x, top, z], model) {
    const { scene } = ctx;
    const lamp = group(scene, [x, top, z]);
    let bulb;

    if (model) {
        model.scale.setScalar(0.8);
        model.rotation.y = Math.PI - 0.35; // la cabeza hacia la mesa, algo girada hacia el teclado
        lamp.add(model);
        // dos piezas: el cuerpo y la bombilla (la más pequeña)
        const meshes = [];
        model.traverse((obj) => obj.isMesh && meshes.push(obj));
        const size = (mesh) => new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).length();
        meshes.sort((a, b) => size(a) - size(b));
        bulb = meshes.length > 1 ? meshes[0] : null;
        meshes.forEach((mesh) => {
            mesh.castShadow = mesh !== bulb;
            mesh.receiveShadow = true;
            if (mesh === bulb) {
                mesh.material = new THREE.MeshBasicMaterial({ color: 0xfff0d8, toneMapped: false });
                mesh.userData.noTint = true;
            } else {
                // de naranja a negro mate: la textura conserva el detalle
                mesh.material.color.setScalar(0.16);
                ctx.reflect(mesh.material, 0.5);
            }
        });
    } else {
        const metal = std(0x0e0f1e, { metalness: 0.5, roughness: 0.4 });
        addMesh(lamp, new THREE.CylinderGeometry(0.08, 0.09, 0.02, 24), metal, [0, 0.01, 0]);
        addMesh(lamp, new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8), metal, [0.03, 0.2, 0], { rot: [0, 0, -0.18] });
        addMesh(lamp, new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), metal, [0.17, 0.43, 0], { rot: [0, 0, 1.1] });
        addMesh(lamp, new THREE.ConeGeometry(0.1, 0.14, 24, 1, true), std(PINK, { side: THREE.DoubleSide, roughness: 0.4 }), [0.3, 0.42, 0], { rot: [0, 0, 0.35] });
        bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d8, toneMapped: false }));
        bulb.position.set(0.3, 0.38, 0);
        lamp.add(bulb);
    }

    ctx.interactive(lamp, { key: 'lamp' });

    // luces en la bombilla (posición en mundo, tras colocar el flexo)
    lamp.updateMatrixWorld(true);
    const at = new THREE.Box3().setFromObject(bulb).getCenter(new THREE.Vector3());
    const light = new THREE.PointLight(0xffc6d6, 3, 3, 2);
    light.position.copy(at).add(new THREE.Vector3(0, -0.04, 0));
    const pool = new THREE.SpotLight(0xffd6e0, 6, 2.6, 0.8, 0.7, 2);
    pool.position.copy(at);
    pool.target.position.set(at.x + 0.2, top, at.z + 0.35);
    scene.add(light, pool, pool.target);

    const on = new THREE.Color(0xfff0d8);
    const off = new THREE.Color(0x3a3440);
    ctx.animations.push(() => {
        const k = ctx.world.lamp * ctx.wake.lamp;
        light.intensity = 3 * k;
        pool.intensity = 6 * k;
        bulb.material.color.copy(off).lerp(on, k).multiplyScalar(1 + (ctx.hdr ? 0.7 : 0) * k);
    });
}

/** El astronauta: mascota y guía de la sala. Clic: salto con pirueta; saluda al pasar el cursor. */
function buildAstronaut(ctx, [x, y, z]) {
    const suit = ctx.reflect(std(0xf4f2f8, { roughness: 0.45 }), 0.4);
    const g = group(ctx.scene, [x, y, z]);
    g.scale.setScalar(1.9);
    addMesh(g, rounded(0.06, 0.07, 0.04, 0.012), suit, [0, 0.075, 0]);
    addMesh(g, rounded(0.05, 0.06, 0.022, 0.008), std(0xcfd2e6), [0, 0.08, -0.03]);
    addMesh(g, new THREE.SphereGeometry(0.036, 32, 20), suit, [0, 0.14, 0]);
    const visor = addMesh(g, new THREE.SphereGeometry(0.028, 32, 16), ctx.reflect(std(0x101428, { metalness: 0.9, roughness: 0.08 }), 1.2), [0, 0.14, 0.014]);
    visor.scale.set(1, 0.85, 0.8);
    const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 12);
    const armL = addMesh(g, limb(0.011, 0.035), suit, [-0.042, 0.075, 0]);
    addMesh(g, limb(0.011, 0.035), suit, [0.042, 0.075, 0]);
    addMesh(g, limb(0.013, 0.025), suit, [-0.017, 0.024, 0]);
    addMesh(g, limb(0.013, 0.025), suit, [0.017, 0.024, 0]);
    addMesh(g, box(0.02, 0.012, 0.004), new THREE.MeshBasicMaterial({ color: ctx.glow(PINK, 2), toneMapped: false }), [0, 0.09, 0.021], { shadow: false });

    let jump = 1;
    const item = ctx.interactive(g, {
        key: 'astronaut',
        onClick: () => {
            if (jump >= 1) jump = 0;
        },
    });

    // punto sobre el casco donde se ancla el bocadillo del guía
    ctx.anchors.astronaut = new THREE.Vector3();
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
        // saluda con el brazo al pasar el cursor (o cuando el guía habla)
        const wave = Math.max(item.hover(), ctx.guideTalking);
        armL.rotation.z = wave * (2.4 + Math.sin(t * 12) * 0.35);
        armL.position.y = 0.075 + wave * 0.03;
        ctx.anchors.astronaut.set(x, g.position.y + 0.36, z);
    });
}
