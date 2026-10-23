/**
 * Poses de cámara por sección. `pos` es dónde está la cámara y `look` el punto
 * al que mira. El panel de cada sección ocupa un lado de la pantalla, así que
 * `look` se desplaza hacia el lado contrario para que el objeto 3D quede visible
 * junto al panel (por ejemplo, el panel de Experiencia va a la izquierda y las
 * insignias quedan a la derecha).
 *
 * `intro` es la pose detrás del boot: al entrar, la cámara vuela de ahí al hero.
 */
export const STOPS = {
    intro: { pos: [2.7, 2.55, 3.0], look: [0.4, 1.3, -2.7], fov: 64 },
    hero: { pos: [0.7, 1.45, 0.9], look: [0.15, 1.0, -2.7], fov: 56 },
    projects: { pos: [-0.5, 1.2, -1.35], look: [-0.5, 1.2, -3.0], fov: 50 },
    experience: { pos: [1.15, 1.72, -1.1], look: [0.85, 1.62, -3.3], fov: 56 },
    about: { pos: [-0.6, 1.65, -0.2], look: [0.35, 1.5, -3.2], fov: 54 },
    contact: { pos: [0.2, 1.3, -0.6], look: [1.6, 0.95, -2.9], fov: 56 },
};

/** Cuánto se puede girar la vista arrastrando en la habitación (radianes). */
export const LOOK_LIMITS = { yaw: 0.85, pitchUp: 0.3, pitchDown: 0.25 };

/** Cuánto se puede acercar (+) o alejar (−) la cámara con rueda o pellizco (metros). */
export const ZOOM_LIMITS = { min: -0.5, max: 1.5 };
