/**
 * Poses de cámara por sección. `pos` es dónde está la cámara y `look` el punto
 * al que mira. El panel de cada sección ocupa un lado de la pantalla, así que
 * `look` se desplaza hacia el lado contrario para que el objeto 3D quede visible
 * junto al panel (por ejemplo, el panel de Experiencia va a la izquierda y las
 * insignias quedan a la derecha).
 *
 * `intro` es la pose detrás del boot: al entrar, la cámara vuela de ahí al hero.
 */
// pared de las insignias (ver buildRoom.js)
const WALL_X = 4.35;

export const STOPS = {
    intro: { pos: [-3.2, 3.3, 4.0], look: [1.2, 1.0, -2.2], fov: 64 },
    hero: { pos: [-2.4, 1.95, 3.3], look: [1.4, 0.72, -2.1], fov: 54 },
    projects: { pos: [0, 1.25, 0.1], look: [0, 1.25, -1.25], fov: 50 },
    experience: { pos: [1.7, 1.95, 1.6], look: [WALL_X, 1.85, 0.3], fov: 56 },
    about: { pos: [0.4, 1.85, -2.7], look: [-3.0, 1.7, -5.0], fov: 56 },
    contact: { pos: [0.0, 1.35, 0.4], look: [2.8, 0.95, -1.6], fov: 56 },
};

/** Cuánto se puede girar la vista arrastrando en la habitación (radianes). */
export const LOOK_LIMITS = { yaw: 0.85, pitchUp: 0.3, pitchDown: 0.25 };

/** Cuánto se puede acercar (+) o alejar (−) la cámara con rueda o pellizco (metros). */
export const ZOOM_LIMITS = { min: -0.5, max: 1.5 };
