import esHero from './data/es/hero.json';
import esSite from './data/es/site.json';
import esProjects from './data/es/projects.json';
import esExperience from './data/es/experience.json';
import esEducation from './data/es/education.json';
import esStack from './data/es/stack.json';
import esContact from './data/es/contact.json';
import enHero from './data/en/hero.json';
import enSite from './data/en/site.json';
import enProjects from './data/en/projects.json';
import enExperience from './data/en/experience.json';
import enEducation from './data/en/education.json';
import enStack from './data/en/stack.json';
import enContact from './data/en/contact.json';

/**
 * Todo el contenido vive en `src/data/<idioma>/*.json`. Para cambiar un dato basta
 * con editar el JSON del idioma: ni la escena 3D ni los paneles tienen contenido propio.
 * Los textos de interfaz (botones, pistas, avisos) están en `src/i18n/strings.js`.
 */
const CONTENT = {
    es: { hero: esHero, site: esSite, projects: esProjects, experience: esExperience, education: esEducation, stack: esStack, contact: esContact },
    en: { hero: enHero, site: enSite, projects: enProjects, experience: enExperience, education: enEducation, stack: enStack, contact: enContact },
};

export const LANGS = ['es', 'en'];

export const getContent = (lang) => CONTENT[lang];

/** Secciones navegables, en el orden de la barra inferior. */
export const SECTION_IDS = ['projects', 'experience', 'about', 'contact'];

export const sectionsFor = (strings) => SECTION_IDS.map((id, i) => ({ id, num: `0${i + 1}`, label: strings.sections[id] }));
