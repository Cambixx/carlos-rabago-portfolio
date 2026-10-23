import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { CREDITS } from '../scene/credits';
import ContactForm from './ContactForm';
import Terminal from './Terminal';
import Win from './Win';

function Chips({ items, highlight = [] }) {
    return (
        <ul className="chips">
            {items.map((item) => (
                <li key={item} className={highlight.includes(item) ? 'is-hot' : ''}>
                    {item}
                </li>
            ))}
        </ul>
    );
}

function ProjectWindow({ project }) {
    const { t } = useI18n();
    return (
        <Win title={project.title} className="win-project">
            <a className="shot" href={project.url} target="_blank" rel="noopener noreferrer" aria-label={t.panels.visitAria(project.title)}>
                <img src={project.image} alt={t.panels.shotAlt(project.title)} width="1280" height="720" loading="lazy" decoding="async" />
            </a>
            <div className="project-info">
                <div className="project-head">
                    <h3>{project.title}</h3>
                    <span className="year">{project.year}</span>
                </div>
                <p>{project.description}</p>
                <Chips items={project.tech} />
                <a className="visit" href={project.url} target="_blank" rel="noopener noreferrer">
                    {t.panels.visit}
                </a>
            </div>
        </Win>
    );
}

function useClock(locale) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, []);
    return now.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Sección Proyectos: el monitor como escritorio con espacios de trabajo por categoría.
 * `focus === 'terminal'` (al pulsar el teclado de la sala) pone el cursor en el terminal.
 */
export function ProjectsDesktop({ focus }) {
    const { t, c } = useI18n();
    const { projects, contact } = c;
    const [filter, setFilter] = useState('all');
    const clock = useClock(t.panels.locale);
    const spaces = [
        { key: 'all', label: projects.filterAllLabel.toLowerCase() },
        ...projects.categories.map((cat) => ({ key: cat.key, label: cat.label.toLowerCase() })),
    ];
    const shown = filter === 'all' ? projects.items : projects.items.filter((p) => p.categoryKey === filter);

    return (
        <div className="desktop">
            <header className="desktop-bar">
                <div className="spaces" role="tablist" aria-label={t.panels.categoriesAria}>
                    {spaces.map((s, i) => (
                        <button
                            key={s.key}
                            type="button"
                            role="tab"
                            aria-selected={filter === s.key}
                            className={filter === s.key ? 'is-active' : ''}
                            onClick={() => setFilter(s.key)}
                        >
                            <span>{i}</span> {s.label}
                        </button>
                    ))}
                </div>
                <time className="clock">{clock}</time>
                <a className="bar-link" href={contact.cv.url} download>
                    CV
                </a>
            </header>
            <div className="desktop-grid">
                <Terminal autoFocus={focus === 'terminal'} />
                {shown.map((p) => (
                    <ProjectWindow key={p.title} project={p} />
                ))}
            </div>
        </div>
    );
}

/**
 * Sección Experiencia: registro cronológico con detalle desplegable. `focus` es
 * la línea del empleo cuya insignia se pulsó en la sala: se abre y se centra.
 */
export function ExperiencePanel({ focus }) {
    const { t, c } = useI18n();
    const { experience, contact } = c;
    const [open, setOpen] = useState(() => new Set([experience.items[0].line]));
    const itemRefs = useRef({});

    useEffect(() => {
        if (!focus) return;
        setOpen((prev) => (prev.has(focus) ? prev : new Set(prev).add(focus)));
        // tras pintar el detalle abierto, para que el desplazamiento sea el correcto
        requestAnimationFrame(() => itemRefs.current[focus]?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }, [focus]);

    const toggle = (line) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(line)) next.delete(line);
            else next.add(line);
            return next;
        });

    return (
        <Win title={t.panels.files.experience} className="win-panel">
            <header className="panel-head">
                <span className="meta">{experience.sectionMeta}</span>
                <h2>{experience.title.join(' ')}</h2>
            </header>
            <ol className="timeline">
                {experience.items.map((job) => {
                    const isOpen = open.has(job.line);
                    return (
                        <li
                            key={job.line}
                            ref={(el) => {
                                itemRefs.current[job.line] = el;
                            }}
                            className={[job.isCurrent && 'is-current', focus === job.line && 'is-focus'].filter(Boolean).join(' ')}
                        >
                            <div className="job-head">
                                <span className="line">{job.line}</span>
                                <div>
                                    <h3>
                                        {job.title} <em>@ {job.company}</em>
                                    </h3>
                                    <p className="period">
                                        {job.period}
                                        {job.isCurrent && <span className="live">{t.panels.current}</span>}
                                    </p>
                                </div>
                            </div>
                            <p className="job-desc">{job.description}</p>
                            {isOpen && (
                                <ul className="job-points">
                                    {job.highlights.map((h) => (
                                        <li key={h}>{h}</li>
                                    ))}
                                </ul>
                            )}
                            <button type="button" className="more" aria-expanded={isOpen} onClick={() => toggle(job.line)}>
                                {isOpen ? t.panels.less : t.panels.more}
                            </button>
                        </li>
                    );
                })}
            </ol>
            <a className="btn btn-primary btn-block" href={contact.cv.url} download>
                {contact.cv.label}
            </a>
        </Win>
    );
}

/** Sección Sobre mí: presentación, formación y stack. */
export function AboutPanel() {
    const { t, c } = useI18n();
    const { hero, education, stack } = c;
    const hot = stack.categories.flatMap((cat) => cat.skills.filter((s) => s.highlighted).map((s) => s.name));
    return (
        <div className="stack-col">
            <Win title={t.panels.files.about} className="win-panel">
                <header className="panel-head">
                    <span className="meta">{hero.location}</span>
                    <h2>{hero.subtitle}</h2>
                </header>
                <p className="lede">{hero.description}</p>
                <dl className="stats">
                    {hero.stats.map((s) => (
                        <div key={s.label}>
                            <dt>{s.value}</dt>
                            <dd>{s.label}</dd>
                        </div>
                    ))}
                </dl>
                <p className="coords">{hero.coordinates}</p>
            </Win>

            <Win title={t.panels.files.education} className="win-panel">
                <header className="panel-head">
                    <span className="meta">{education.sectionMeta}</span>
                    <h2>{education.title.join(' ')}</h2>
                </header>
                <p className="lede">{education.description}</p>
                <ul className="edu">
                    {education.items.map((item) => (
                        <li key={item.line}>
                            <span className="line">{item.line}</span>
                            <div>
                                <h3>{item.title}</h3>
                                <p className="period">
                                    {item.school} · {item.period}
                                </p>
                                <p>{item.description}</p>
                            </div>
                        </li>
                    ))}
                </ul>
                <p className="langs">
                    <b>{education.languages.label}</b> {education.languages.items.join(' · ')}
                </p>
            </Win>

            <Win title={t.panels.files.stack} className="win-panel">
                <header className="panel-head">
                    <span className="meta">{stack.sectionMeta}</span>
                    <h2>{stack.title.join(' ')}</h2>
                </header>
                <p className="lede">{stack.description}</p>
                {stack.categories.map((cat) => (
                    <div key={cat.label} className="skill-group">
                        <h3>{cat.label}</h3>
                        <Chips items={cat.skills.map((s) => s.name)} highlight={hot} />
                    </div>
                ))}
            </Win>
        </div>
    );
}

function CopyEmail({ email }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(email);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* sin permiso de portapapeles: el enlace mailto sigue funcionando */
        }
    };
    return (
        <button type="button" className="copy" onClick={copy} title={t.panels.copyTitle}>
            {copied ? t.panels.copied : t.panels.copy}
        </button>
    );
}

/** Sección Contacto: email directo, formulario (Netlify Forms), redes y CV. */
export function ContactPanel() {
    const { t, c } = useI18n();
    const { contact, site } = c;
    return (
        <Win title={t.panels.files.contact} className="win-panel">
            <header className="panel-head">
                <span className="meta">{contact.sectionMeta}</span>
                <h2>{contact.title.join(' ')}</h2>
            </header>
            <p className="avail">
                <i aria-hidden="true" /> {contact.availability}
            </p>
            <div className="mail-row">
                <a className="mail" href={`mailto:${contact.email}`}>
                    {contact.email}
                </a>
                <CopyEmail email={contact.email} />
            </div>
            <ContactForm />
            <h3 className="sub">{contact.socialLabel}</h3>
            <ul className="socials">
                {contact.social.map((s) => (
                    <li key={s.label}>
                        <a href={s.url} target={s.url.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
                            <span>{s.label}</span>
                            <b>{s.path}</b>
                        </a>
                    </li>
                ))}
            </ul>
            <a className="btn btn-ghost btn-block" href={contact.cv.url} download>
                {contact.cv.label}
            </a>
            <p className="foot">{site.footer.left}</p>
            <p className="credits">
                {t.panels.credits}{' '}
                {Object.values(CREDITS).map((credit) => (
                    <span key={credit.url}>
                        <a href={credit.url} target="_blank" rel="noopener noreferrer">
                            «{credit.title}»
                        </a>{' '}
                        · <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer">{credit.author}</a> ·{' '}
                        <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a>
                    </span>
                ))}
            </p>
        </Win>
    );
}

export const PANELS = {
    projects: ProjectsDesktop,
    experience: ExperiencePanel,
    about: AboutPanel,
    contact: ContactPanel,
};
