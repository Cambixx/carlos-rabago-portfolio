import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CREDITS } from './credits';

/**
 * Modelos 3D externos que sustituyen a piezas de la sala. Los originales están en
 * `src-images/models/` y se optimizan con gltf-transform a `public/models/*.glb`
 * (ver README). Sus créditos están en `credits.js` y se muestran en Contacto (CC BY lo exige).
 */
export const MODELS = {
    speaker: {
        url: '/models/speaker-1.glb',
        height: 0.42, // metros: alto final en la sala
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
