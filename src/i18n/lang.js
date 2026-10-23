import { LANGS } from '../content';

const STORAGE_KEY = 'lang';

/**
 * Idioma inicial: `?lang=en` en la URL, luego la última elección guardada y, si no
 * hay ninguna, el idioma del navegador (español si empieza por "es"; si no, inglés).
 */
export function detectLang() {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (LANGS.includes(saved)) return saved;
    } catch {
        /* almacenamiento bloqueado */
    }
    return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function saveLang(lang) {
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch {
        /* almacenamiento bloqueado */
    }
}
