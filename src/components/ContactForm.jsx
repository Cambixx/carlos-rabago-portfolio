import { useState } from 'react';
import { useI18n } from '../i18n/context';

/** Nombre del formulario en Netlify Forms; debe coincidir con el formulario oculto de index.html. */
const FORM_NAME = 'contacto';

/**
 * Formulario que envía a Netlify Forms (sin servidor propio). Netlify detecta el
 * formulario en el index.html publicado y guarda los mensajes; los avisos por
 * email se configuran en el panel de Netlify. `bot-field` es un campo trampa:
 * las personas no lo ven, los bots lo rellenan y Netlify los descarta.
 */
export default function ContactForm({ onSent }) {
    const { lang, t, c } = useI18n();
    const f = t.form;
    const [status, setStatus] = useState('idle'); // idle | sending | sent | error

    const onSubmit = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        data.set('form-name', FORM_NAME);
        data.set('lang', lang);
        setStatus('sending');
        try {
            const res = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(data).toString(),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            form.reset();
            setStatus('sent');
            onSent?.();
        } catch {
            setStatus('error');
        }
    };

    if (status === 'sent') {
        return (
            <div className="form-done" role="status">
                <p>{f.sent}</p>
                <button type="button" className="more" onClick={() => setStatus('idle')}>
                    {f.again}
                </button>
            </div>
        );
    }

    return (
        <form className="contact-form" name={FORM_NAME} method="POST" onSubmit={onSubmit}>
            <h3 className="sub">{f.title}</h3>
            <p className="hp" aria-hidden="true">
                <label>
                    No rellenar: <input name="bot-field" tabIndex={-1} autoComplete="off" />
                </label>
            </p>
            <div className="field-row">
                <label className="field">
                    <span>{f.name}</span>
                    <input name="name" required maxLength={120} autoComplete="name" />
                </label>
                <label className="field">
                    <span>{f.email}</span>
                    <input name="email" type="email" required maxLength={200} autoComplete="email" />
                </label>
            </div>
            <label className="field">
                <span>{f.message}</span>
                <textarea name="message" required rows={4} maxLength={4000} placeholder={f.messagePlaceholder} />
            </label>
            {status === 'error' && (
                <p className="form-error" role="alert">
                    {f.error} <a href={`mailto:${c.contact.email}`}>{c.contact.email}</a>
                </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={status === 'sending'}>
                {status === 'sending' ? f.sending : c.contact.cta}
            </button>
        </form>
    );
}
