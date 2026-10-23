import { useCallback, useEffect, useMemo, useState } from 'react';
import { getContent, sectionsFor } from '../content';
import { I18nContext } from './context';
import { detectLang, saveLang } from './lang';
import { STRINGS } from './strings';

/**
 * Proporciona el idioma activo a toda la app: `t` (textos de interfaz), `c`
 * (contenido de `src/data/<idioma>`) y `sections`. También mantiene al día el
 * `lang` de <html>, el título y la meta descripción.
 */
export default function I18nProvider({ children }) {
    const [lang, setLangState] = useState(detectLang);

    const setLang = useCallback((next) => {
        setLangState(next);
        saveLang(next);
        // si se llegó con ?lang=…, se actualiza para que recargar no devuelva el idioma anterior
        const url = new URL(window.location.href);
        if (url.searchParams.has('lang')) {
            url.searchParams.set('lang', next);
            window.history.replaceState(null, '', url);
        }
    }, []);

    useEffect(() => {
        const t = STRINGS[lang];
        document.documentElement.lang = lang;
        document.title = t.meta.title;
        document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
    }, [lang]);

    const value = useMemo(() => {
        const t = STRINGS[lang];
        return { lang, setLang, t, c: getContent(lang), sections: sectionsFor(t) };
    }, [lang, setLang]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
