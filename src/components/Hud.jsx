import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import LangSwitch from './LangSwitch';

/** Título central: se desvanece al entrar en una sección o al explorar la sala. */
export function HeroTitle({ hidden }) {
    const { t, c } = useI18n();
    return (
        <div className={`hero-title ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
            <h1 className="glitch" data-text={c.site.brand}>
                {c.site.brand}
            </h1>
            <p>{t.tagline}</p>
            <p className="hero-role">{c.hero.subtitle}</p>
        </div>
    );
}

/** Barra inferior con las secciones numeradas. */
export function NavPill({ section, onSelect }) {
    const { t, sections } = useI18n();
    return (
        <nav className="nav-pill" aria-label={t.hud.navAria}>
            {sections.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    className="nav-item"
                    aria-label={s.label}
                    aria-current={section === s.id ? 'page' : undefined}
                    onClick={() => onSelect(s.id)}
                >
                    <span className="n">{s.num}</span>
                    <span className="l">{s.label}</span>
                </button>
            ))}
        </nav>
    );
}

/** Menú de cuatro puntos arriba a la derecha: idioma, sonido, música, CV y versión plana. */
export function MenuButton({ sound, onToggleSound, music, onToggleMusic, flat, canToggleFlat, onToggleFlat }) {
    const { t, c } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => {
            if (!ref.current?.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="menu" ref={ref}>
            <button type="button" className="icon-btn" aria-label={t.hud.menu} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
                <span className="dots" aria-hidden="true">
                    <i /><i /><i /><i />
                </span>
            </button>
            {open && (
                <div className="menu-pop" role="menu">
                    <div className="menu-row">
                        <span>{t.hud.language}</span>
                        <LangSwitch />
                    </div>
                    <button type="button" role="menuitem" onClick={onToggleSound}>
                        <span>{t.hud.sound}</span>
                        <b>{sound ? 'ON' : 'OFF'}</b>
                    </button>
                    <button type="button" role="menuitem" onClick={onToggleMusic}>
                        <span>{t.hud.music}</span>
                        <b>{music ? 'ON' : 'OFF'}</b>
                    </button>
                    <a role="menuitem" href={c.contact.cv.url} download>
                        <span>{t.hud.cv}</span>
                        <b>PDF</b>
                    </a>
                    {canToggleFlat && (
                        <button type="button" role="menuitem" onClick={onToggleFlat}>
                            <span>{flat ? t.hud.view3d : t.hud.viewFlat}</span>
                            <b>{flat ? '3D' : '2D'}</b>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export function BackButton({ onClick }) {
    const { t } = useI18n();
    return (
        <button type="button" className="back-btn" onClick={onClick}>
            <span aria-hidden="true">◂</span> {t.hud.back}
        </button>
    );
}

/** Pestaña vertical pegada al borde derecho con el estado de disponibilidad. */
export function StatusTab() {
    const { c } = useI18n();
    return (
        <div className="status-tab" aria-label={c.site.statusBar.text}>
            <i style={{ background: c.site.statusBar.color }} aria-hidden="true" />
            <span>{c.site.statusBar.text}</span>
        </div>
    );
}

/** Etiqueta que sigue al cursor sobre un objeto clicable: nombre + qué hace. */
export function HoverTip({ hover }) {
    if (!hover) return null;
    return (
        <div className="hover-tip" style={{ left: hover.x, top: hover.y }}>
            <b>{hover.label}</b>
            {hover.hint && <span>{hover.hint}</span>}
        </div>
    );
}

/** Contador de objetos de la sala con los que ya se ha interactuado. */
export function Discoveries({ count, total }) {
    const { t } = useI18n();
    const done = count === total;
    return (
        <div className={`discoveries ${done ? 'is-done' : ''}`} title={t.hud.discoveriesTitle}>
            <span className="d-icon" aria-hidden="true">
                ◆
            </span>
            <span>
                <b>
                    {count}/{total}
                </b>{' '}
                {done ? t.hud.explored : t.hud.discovered}
            </span>
            <i className="d-bar" aria-hidden="true">
                <i style={{ width: `${(count / total) * 100}%` }} />
            </i>
        </div>
    );
}

/** Aviso breve al interactuar con un objeto. `key` lo reinicia en cada aviso nuevo. */
export function Toast({ toast }) {
    if (!toast) return null;
    return (
        <div key={toast.id} className="toast" role="status">
            {toast.text}
        </div>
    );
}
