import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CREDITS } from './credits';

/**
 * Modelos 3D externos que sustituyen a piezas de la sala. Los originales están en
 * `src-images/models/` y se optimizan con gltf-transform a `public/models/*.glb`
 * (ver README). Sus créditos están en `credits.js` y se muestran en Contacto (CC BY lo exige).
 */
export const MODELS = {
    // La sala entera. Su luz va "horneada" en las texturas (emisivas): la escena la
    // tiñe y atenúa según la hora, el tiempo y la lámpara.
    office: {
        url: '/models/office.glb',
        credit: CREDITS.office,
    },
    // Sustituye a la silla de la oficina (que se queda si este modelo no carga).
    chair: {
        url: '/models/chair.glb',
        height: 1.12, // metros
        facing: 0, // giro (radianes) para que su frente mire como la silla original
        credit: CREDITS.chair,
    },
    speaker: {
        url: '/models/speaker-1.glb',
        height: 0.3, // metros: alto final, sobre la mesa
        // materiales que emiten luz en el modelo: laten con la música
        glowMaterials: ['PlasticBody.005', 'PlasticBody.006'],
        credit: CREDITS.speaker,
    },
};

let loader = null;

/** Carga un .glb (con compresión meshopt) y devuelve su escena. */
export function loadModel(url) {
    loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    return loader.loadAsync(url).then((gltf) => gltf.scene);
}
