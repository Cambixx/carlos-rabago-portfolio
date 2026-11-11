import { useCallback, useRef, useState } from 'react';

/** Logros secretos de la sala, en el orden en que se muestran. Textos en `strings.js` → `achievements`. */
export const ACHIEVEMENTS = ['explorer', 'tour', 'gravity', 'hacker', 'night', 'coffee', 'dj', 'photo', 'polyglot', 'palette'];

const KEY = 'sala-logros';

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
        return new Set(saved.filter((id) => ACHIEVEMENTS.includes(id)));
    } catch {
        return new Set();
    }
}

function save(set) {
    try {
        localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch {
        /* sin almacenamiento: los logros duran lo que dure la visita */
    }
}

/**
 * Logros conseguidos (se recuerdan en este navegador). `unlock(id)` avisa con
 * `onUnlock(id)` solo la primera vez.
 */
export function useAchievements(onUnlock) {
    const [unlocked, setUnlocked] = useState(load);
    const ref = useRef(unlocked);
    const notify = useRef(onUnlock);
    notify.current = onUnlock;

    const unlock = useCallback((id) => {
        if (ref.current.has(id)) return;
        const next = new Set(ref.current).add(id);
        ref.current = next;
        setUnlocked(next);
        save(next);
        notify.current?.(id);
    }, []);

    return { unlocked, unlock };
}
