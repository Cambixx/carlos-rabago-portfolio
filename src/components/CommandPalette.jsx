import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';

// sin tildes ni mayúsculas: "musica" encuentra "Música"
const normalize = (text) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

/**
 * Paleta de comandos (⌘K / Ctrl+K o "/"): ir a cualquier sección o proyecto y
 * lanzar cualquier acción de la sala desde el teclado. `commands`:
 * [{ id, group, label, hint?, keywords?, run }]. ↑/↓ eligen, Intro ejecuta, Esc cierra.
 */
export default function CommandPalette({ commands, onClose }) {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const results = useMemo(() => {
        const words = normalize(query).split(/\s+/).filter(Boolean);
        if (!words.length) return commands;
        return commands.filter((cmd) => {
            const haystack = normalize(`${cmd.label} ${cmd.hint ?? ''} ${cmd.keywords ?? ''} ${t.palette.groups[cmd.group]}`);
            return words.every((w) => haystack.includes(w));
        });
    }, [commands, query, t]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => setActive(0), [query]);

    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const run = (cmd) => {
        onClose();
        cmd.run();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            run(results[active]);
        }
    };

    let lastGroup = null;
    return (
        <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="palette" role="dialog" aria-modal="true" aria-label={t.palette.title}>
                <div className="palette-search">
                    <span aria-hidden="true">⌘</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={t.palette.placeholder}
                        aria-label={t.palette.placeholder}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="palette-list"
                        aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
                        spellCheck="false"
                        autoComplete="off"
                    />
                    <kbd>esc</kbd>
                </div>
                <ul id="palette-list" ref={listRef} className="palette-list" role="listbox">
                    {results.length === 0 && <li className="palette-empty">{t.palette.empty}</li>}
                    {results.map((cmd, i) => {
                        const header = cmd.group !== lastGroup ? t.palette.groups[cmd.group] : null;
                        lastGroup = cmd.group;
                        return (
                            <li key={cmd.id} role="presentation">
                                {header && <span className="palette-group">{header}</span>}
                                <div
                                    id={`cmd-${cmd.id}`}
                                    role="option"
                                    aria-selected={i === active}
                                    className="palette-item"
                                    onMouseMove={() => setActive(i)}
                                    onClick={() => run(cmd)}
                                >
                                    <span>{cmd.label}</span>
                                    {cmd.hint && <small>{cmd.hint}</small>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
