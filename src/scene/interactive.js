import * as THREE from 'three';

const HIGHLIGHT = new THREE.Color(0xff9ebd);

/**
 * Convierte un grupo de la escena en un objeto clicable.
 *
 * - Clona sus materiales para poder resaltarlo (tinte rosa emisivo) sin afectar
 *   a otros objetos que compartieran material.
 * - Marca cada malla con `userData.item`, que es lo que busca el raycast.
 *
 * `def` lleva { key, id, label, hint, section, focus, onClick }. Las referencias
 * a materiales deben leerse después de llamar a esta función (se sustituyen).
 */
export function makeInteractive(root, def) {
    const tinted = [];
    // `strength` escala el tinte: los modelos importados (materiales oscuros y metálicos) lo necesitan más suave
    const register = (object, strength = 1) => {
        object.traverse((obj) => {
            if (!obj.isMesh) return;
            const list = Array.isArray(obj.material) ? obj.material : [obj.material];
            const cloned = list.map((m) => m.clone());
            obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
            if (obj.userData.noTint) return;
            cloned.forEach((m) => {
                if (m.emissive) tinted.push({ m, base: m.emissive.clone(), baseIntensity: m.emissiveIntensity, strength });
            });
        });
    };
    register(root);

    const state = { hover: 0, target: 0 };
    const item = {
        ...def,
        id: def.id ?? def.key,
        root,
        hover: () => state.hover,
        setHover(on) {
            state.target = on ? 1 : 0;
        },
        tick(dt) {
            if (state.target === 0 && state.hover === 0) return;
            state.hover += (state.target - state.hover) * Math.min(1, dt * 10);
            if (state.target === 0 && state.hover < 0.002) state.hover = 0;
            tinted.forEach(({ m, base, baseIntensity, strength }) => {
                m.emissive.copy(base).lerp(HIGHLIGHT, state.hover * 0.32 * strength);
                m.emissiveIntensity = baseIntensity + state.hover * 0.5 * strength;
            });
        },
    };
    root.traverse((obj) => {
        obj.userData.item = item;
    });
    /** Incorpora piezas añadidas después (p. ej. un modelo .glb que termina de cargar). */
    item.adopt = (object, { tint = 1 } = {}) => {
        register(object, tint);
        object.traverse((obj) => {
            obj.userData.item = item;
        });
    };
    return item;
}

/** Para mallas decorativas que no deben tapar el raycast (partículas, cables). */
export function noRaycast(obj) {
    obj.raycast = () => {};
    return obj;
}
