import { createContext, useContext } from 'react';

export const I18nContext = createContext(null);

/** { lang, setLang, t, c, sections } del idioma activo. */
export const useI18n = () => useContext(I18nContext);
