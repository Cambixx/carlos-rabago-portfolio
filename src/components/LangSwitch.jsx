import { LANGS } from '../content';
import { useI18n } from '../i18n/context';

/** Selector ES · EN. */
export default function LangSwitch({ className = '' }) {
    const { lang, setLang, t } = useI18n();
    return (
        <div className={`lang-switch ${className}`} role="group" aria-label={t.hud.language}>
            {LANGS.map((l) => (
                <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
                    {l.toUpperCase()}
                </button>
            ))}
        </div>
    );
}
