import { useEffect, useRef, useState } from 'react';
import { LANGS } from '../content';
import { useI18n } from '../i18n/context';
import { tick } from '../lib/audio';
import { useRoomActions } from '../lib/roomActions';
import { madridTime } from '../lib/time';
import Win from './Win';

const INVADER = ['..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', '.XXXXXX.', '.X....X.', 'X......X'];

// Los comandos se aceptan en español y en inglés, sea cual sea el idioma de la interfaz.
const COMMANDS = [
    'help', 'ayuda', 'whoami', 'fetch', 'ls', 'proyectos', 'projects', 'open', 'abrir', 'exp', 'experiencia', 'experience',
    'cd', 'contacto', 'contact', 'cv', 'email', 'correo', 'tiempo', 'weather', 'dia', 'day', 'atardecer', 'dusk', 'noche',
    'night', 'lampara', 'lamp', 'musica', 'music', 'lang', 'idioma', 'date', 'fecha', 'hora', 'clear', 'cls', 'echo',
    'history', 'historial', 'sudo', 'rm', 'exit', 'salir',
];
const SECTION_ALIASES = {
    proyectos: 'projects',
    projects: 'projects',
    experiencia: 'experience',
    experience: 'experience',
    exp: 'experience',
    'sobre-mi': 'about',
    about: 'about',
    contacto: 'contact',
    contact: 'contact',
    sala: null,
    room: null,
    '~': null,
    '..': null,
};
const SKY_ALIASES = { dia: 'day', day: 'day', atardecer: 'dusk', dusk: 'dusk', noche: 'night', night: 'night' };

function FetchBlock() {
    const { t, c } = useI18n();
    const f = t.panels.fetch;
    const rows = [
        [f.role, c.hero.subtitle],
        [f.base, c.hero.location],
        [f.stack, c.hero.coreStack.slice(0, 3).join(' · ')],
        [f.projects, f.inProduction(c.projects.items.length)],
        [f.status, f.available],
    ];
    return (
        <>
            <div className="fetch">
                <div className="pixel-art" aria-hidden="true">
                    {INVADER.join('').split('').map((ch, i) => (
                        <i key={i} className={ch === 'X' ? 'on' : ''} />
                    ))}
                </div>
                <dl>
                    <dt className="who">{f.host}</dt>
                    {rows.map(([k, v]) => (
                        <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                        </div>
                    ))}
                </dl>
            </div>
            <p className="swatches" aria-hidden="true">
                {['#ff9ebd', '#ffd29a', '#4ade80', '#7fd6ff', '#b79cff', '#f4eef2'].map((col) => (
                    <i key={col} style={{ background: col }} />
                ))}
            </p>
        </>
    );
}

function downloadCv(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
}

/**
 * Terminal de verdad: arranca con un `fetch` y acepta comandos (help, ls, open,
 * cd, tiempo, noche, sudo…). ↑/↓ recorren el historial y Tab autocompleta.
 */
export default function Terminal({ autoFocus = false }) {
    const { t, c, setLang } = useI18n();
    const actions = useRoomActions();
    const T = t.terminal;
    const [lines, setLines] = useState(() => [{ kind: 'cmd', text: 'fetch' }, { kind: 'fetch' }, { kind: 'out', text: T.welcome, tone: 'dim' }]);
    const [input, setInput] = useState('');
    const history = useRef([]);
    const historyIndex = useRef(0);
    const inputRef = useRef(null);
    const bodyRef = useRef(null);

    useEffect(() => {
        const el = bodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [lines]);

    // Al llegar desde el teclado de la sala: el monitor aparece al final del vuelo de cámara.
    useEffect(() => {
        if (!autoFocus) return undefined;
        const id = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 1400);
        return () => clearTimeout(id);
    }, [autoFocus]);

    const run = (raw) => {
        const text = raw.trim();
        const out = [{ kind: 'cmd', text }];
        const say = (value, tone) => out.push({ kind: 'out', text: value, tone });
        const pairs = (rows) => out.push({ kind: 'pairs', rows });
        let after = null; // acción que se lanza tras pintar la respuesta (navegar, abrir…)

        if (text) {
            history.current.push(text);
            historyIndex.current = history.current.length;
        }
        const [name = '', ...args] = text.split(/\s+/);
        const cmd = name.toLowerCase();

        switch (cmd) {
            case '':
                break;
            case 'help':
            case 'ayuda':
                pairs(T.help);
                break;
            case 'whoami':
            case 'fetch':
                out.push({ kind: 'fetch' });
                break;
            case 'ls':
            case 'proyectos':
            case 'projects':
                pairs(c.projects.items.map((p, i) => [`[${i + 1}] ${p.title}`, `${p.year} · ${p.category}`]));
                break;
            case 'open':
            case 'abrir': {
                const project = c.projects.items[Number(args[0]) - 1];
                if (!project) {
                    say(T.openUsage, 'err');
                } else {
                    say(T.opening(project.title), 'ok');
                    // se abre aquí mismo, dentro del gesto del teclado, para que el navegador no lo bloquee
                    window.open(project.url, '_blank', 'noopener,noreferrer');
                }
                break;
            }
            case 'exp':
            case 'experiencia':
            case 'experience':
                pairs(c.experience.items.map((job) => [job.period, `${job.title} @ ${job.company}`]));
                break;
            case 'cd': {
                const target = (args[0] || '').toLowerCase();
                if (!(target in SECTION_ALIASES)) say(T.cdUsage, 'err');
                else after = () => actions.navigate(SECTION_ALIASES[target]);
                break;
            }
            case 'contacto':
            case 'contact':
                pairs([['email', c.contact.email], ...c.contact.social.map((s) => [s.label.toLowerCase(), s.path])]);
                break;
            case 'cv':
                say(T.cv, 'ok');
                after = () => downloadCv(c.contact.cv.url);
                break;
            case 'email':
            case 'correo':
                navigator.clipboard?.writeText(c.contact.email).catch(() => {});
                say(T.emailCopied(c.contact.email), 'ok');
                break;
            case 'tiempo':
            case 'weather':
                if (actions.weather) say(T.weatherNow(actions.weather.temp, t.weather[actions.weather.kind]));
                else say(T.weatherUnknown, 'dim');
                break;
            case 'dia':
            case 'day':
            case 'atardecer':
            case 'dusk':
            case 'noche':
            case 'night':
                actions.setSky(SKY_ALIASES[cmd]);
                say(t.toasts.sky[SKY_ALIASES[cmd]], 'ok');
                break;
            case 'lampara':
            case 'lamp': {
                const willBeOn = !actions.getWorld().lamp;
                actions.toggleLamp();
                say(willBeOn ? t.toasts.lampOn : t.toasts.lampOff, 'ok');
                break;
            }
            case 'musica':
            case 'music': {
                const willPlay = !actions.getWorld().music;
                actions.toggleMusic();
                say(willPlay ? t.toasts.musicOn : t.toasts.musicOff, 'ok');
                break;
            }
            case 'lang':
            case 'idioma': {
                const lang = (args[0] || '').toLowerCase();
                if (!LANGS.includes(lang)) say(T.langUsage, 'err');
                else after = () => setLang(lang);
                break;
            }
            case 'date':
            case 'fecha':
            case 'hora':
                say(T.date(madridTime().label));
                break;
            case 'clear':
            case 'cls':
                setLines([]);
                return;
            case 'echo':
                say(args.join(' '));
                break;
            case 'history':
            case 'historial':
                if (history.current.length <= 1) say(T.history, 'dim');
                else pairs(history.current.slice(0, -1).map((h, i) => [String(i + 1), h]));
                break;
            case 'sudo':
                if (/^(contratar|hire)\s+carlos$/i.test(args.join(' '))) {
                    say(T.sudoPrompt, 'dim');
                    say(T.sudoGranted, 'ok');
                    after = () => actions.hire(T.hireSubject);
                } else {
                    say(T.sudoDenied, 'err');
                }
                break;
            case 'rm':
                say(T.rm, 'err');
                break;
            case 'exit':
            case 'salir':
                after = () => actions.navigate(null);
                break;
            default:
                say(T.notFound(name), 'err');
        }

        setLines((prev) => [...prev, ...out].slice(-200));
        if (after) setTimeout(after, 350);
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const list = history.current;
            if (!list.length) return;
            historyIndex.current = Math.min(list.length, Math.max(0, historyIndex.current + (e.key === 'ArrowUp' ? -1 : 1)));
            setInput(list[historyIndex.current] ?? '');
        } else if (e.key === 'Tab') {
            e.preventDefault();
            // como en una shell: completa lo común y, si quedan varias opciones, las lista
            const word = input.trim().toLowerCase();
            const matches = word ? COMMANDS.filter((name) => name.startsWith(word)) : [];
            if (matches.length === 1) {
                setInput(`${matches[0]} `);
            } else if (matches.length > 1) {
                let common = matches[0];
                matches.forEach((m) => {
                    while (!m.startsWith(common)) common = common.slice(0, -1);
                });
                if (common.length > word.length) setInput(common);
                else setLines((prev) => [...prev, { kind: 'out', text: matches.join('  '), tone: 'dim' }]);
            }
        } else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            setLines([]);
        } else if (e.key === 'Escape') {
            inputRef.current?.blur();
        } else if (e.key.length === 1) {
            tick(0.9 + Math.random() * 0.3);
        }
    };

    const onSubmit = (e) => {
        e.preventDefault();
        run(input);
        setInput('');
    };

    return (
        <Win
            title="terminal"
            className="win-terminal"
            bodyProps={{
                ref: bodyRef,
                // clic en cualquier parte del terminal: a escribir (sin robar una selección de texto)
                onClick: () => {
                    if (!window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true });
                },
            }}
        >
            <div role="log" aria-live="polite">
                {lines.map((line, i) => {
                    if (line.kind === 'fetch') return <FetchBlock key={i} />;
                    if (line.kind === 'cmd') {
                        return (
                            <p key={i} className="term-line">
                                <b>{T.host}</b> ~ $ {line.text}
                            </p>
                        );
                    }
                    if (line.kind === 'pairs') {
                        return (
                            <dl key={i} className="term-pairs">
                                {line.rows.map(([k, v]) => (
                                    <div key={k}>
                                        <dt>{k}</dt>
                                        <dd>{v}</dd>
                                    </div>
                                ))}
                            </dl>
                        );
                    }
                    return (
                        <p key={i} className={`term-out ${line.tone ? `is-${line.tone}` : ''}`}>
                            {line.text}
                        </p>
                    );
                })}
            </div>
            <form className="term-line term-input" onSubmit={onSubmit}>
                <label htmlFor="term-input">
                    <b>{T.host}</b> ~ $
                </label>
                <input
                    id="term-input"
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    aria-label={T.inputAria}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                    enterKeyHint="send"
                />
            </form>
        </Win>
    );
}
