import { useEffect } from 'react';
import { useI18n } from '../i18n/context';
import { PANELS } from './panels';

/**
 * Versión plana: los mismos paneles en una sola página con scroll. Se usa si el
 * navegador no tiene WebGL o si la persona la elige en el menú.
 */
export default function FlatSite() {
    const { t, c, sections } = useI18n();

    // `?flat#projects`: el ancla no existe hasta después del boot, así que se busca a mano.
    useEffect(() => {
        const id = window.location.hash.slice(1);
        if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, []);

    return (
        <main className="flat">
            <header className="flat-hero">
                <h1 className="glitch" data-text={c.site.brand}>
                    {c.site.brand}
                </h1>
                <p>{t.tagline}</p>
                <p className="hero-role">{c.hero.subtitle}</p>
            </header>
            {sections.map((s) => {
                const Panel = PANELS[s.id];
                return (
                    <section key={s.id} id={s.id} className={`flat-section flat-${s.id}`} aria-label={s.label}>
                        <h2 className="flat-kicker">
                            <span>{s.num}</span> {s.label}
                        </h2>
                        <Panel />
                    </section>
                );
            })}
        </main>
    );
}
