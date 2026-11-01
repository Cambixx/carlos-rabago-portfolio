import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Utilidades compartidas por los módulos que construyen la sala. */

export const PINK = 0xff9ebd;

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function std(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts });
}

export function addMesh(parent, geometry, material, [x, y, z], { shadow = true, rot } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Caja con aristas redondeadas: lo que distingue un objeto "real" de un bloque. */
export const rounded = (w, h, d, radius, segments = 3) => new RoundedBoxGeometry(w, h, d, segments, radius);

export function group(parent, [x, y, z] = [0, 0, 0], rotationY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotationY;
    parent.add(g);
    return g;
}

/**
 * Normaliza un modelo cargado: lo escala a `height` metros de alto, lo apoya en
 * y = 0 y lo centra en x/z. Devuelve un grupo listo para colocar y clonar.
 */
export function fitModel(model, height) {
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

/** Recorre los materiales estándar de un objeto (para retocarlos o darles reflejos). */
export function eachMaterial(object, fn) {
    object.traverse((obj) => {
        if (!obj.isMesh) return;
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => {
            if (m.isMeshStandardMaterial) fn(m, obj);
        });
    });
}
