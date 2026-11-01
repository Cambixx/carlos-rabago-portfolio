import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/context';

/** Ventana con la tarjeta de visitante: vista previa y descarga. Esc o "Cerrar" la quitan. */
export default function VisitorCard({ image, onClose }) {
    const { t } = useI18n();
    const downloadRef = useRef(null);

    useEffect(() => {
        downloadRef.current?.focus();
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="card-modal" role="dialog" aria-modal="true" aria-label={t.card.title}>
            <div className="card-sheet">
                <h2>{t.card.title}</h2>
                <p>{t.card.text}</p>
                <img src={image} alt={t.card.title} width="1200" height="630" />
                <div className="card-actions">
                    <a ref={downloadRef} className="btn btn-primary" href={image} download={t.card.file}>
                        {t.card.download}
                    </a>
                    <button type="button" className="btn btn-ghost" onClick={onClose}>
                        {t.card.close}
                    </button>
                </div>
            </div>
        </div>
    );
}
