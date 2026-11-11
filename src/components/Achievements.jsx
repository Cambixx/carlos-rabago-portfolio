import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/context';
import { ACHIEVEMENTS } from '../lib/achievements';

/** Lista de logros: los conseguidos brillan; los demás muestran solo la pista. */
export default function Achievements({ unlocked, onClose }) {
    const { t } = useI18n();
    const closeRef = useRef(null);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="card-modal" role="dialog" aria-modal="true" aria-label={t.achievements.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="card-sheet achievements-sheet">
                <h2>{t.achievements.title}</h2>
                <p>{t.achievements.text(unlocked.size, ACHIEVEMENTS.length)}</p>
                <ul className="achievements">
                    {ACHIEVEMENTS.map((id) => {
                        const [name, desc] = t.achievements.items[id];
                        const done = unlocked.has(id);
                        return (
                            <li key={id} className={done ? 'is-done' : ''}>
                                <span className="a-icon" aria-hidden="true">
                                    {done ? '★' : '☆'}
                                </span>
                                <span>
                                    <b>{name}</b>
                                    <small>{desc}</small>
                                </span>
                            </li>
                        );
                    })}
                </ul>
                <div className="card-actions">
                    <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
                        {t.achievements.close}
                    </button>
                </div>
            </div>
        </div>
    );
}
