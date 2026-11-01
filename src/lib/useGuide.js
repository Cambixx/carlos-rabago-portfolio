import { useCallback, useEffect, useRef, useState } from 'react';
import { madridTime } from './time';

const SHOW_MS = 6500; // cuánto dura cada bocadillo
const QUIET_MS = 22000; // tiempo sin tocar nada antes de dar una pista
const CHECK_MS = 4000;
const GREET_MS = 3000; // el título se queda solo unos segundos antes de que hable el guía
const GAP_MS = 900; // pausa entre el saludo y el tiempo
const GRACE_MS = 1800; // el título no vuelve hasta que el guía lleva un rato callado

/**
 * El guía (el astronauta): decide qué dice y cuándo. Habla solo cuando la sala
 * está a la vista (`active`), una frase cada vez y sin agobiar:
 * - saludo al entrar, según la hora de Madrid, y luego el tiempo que hace;
 * - una pista sobre algo sin descubrir si nadie toca nada durante un rato;
 * - ánimos al llegar a 3, 6 y 11 objetos descubiertos.
 * Devuelve la frase actual ({ id, text } o null), `busy` (está hablando o acaba de
 * hablar: el título se aparta), `say` y `touch` (avisa de actividad).
 */
export function useGuide({ active, t, discovered, allKeys, weather }) {
    const [line, setLine] = useState(null);
    const [busy, setBusy] = useState(false);
    const lastActivity = useRef(Date.now());
    const greeted = useRef(false);
    const weatherSaid = useRef(false);
    const lastCount = useRef(discovered.size);

    const say = useCallback((text) => {
        lastActivity.current = Date.now();
        setLine({ id: `${Date.now()}-${Math.random()}`, text });
    }, []);
    const touch = useCallback(() => {
        lastActivity.current = Date.now();
    }, []);

    useEffect(() => {
        if (!line) {
            const id = setTimeout(() => setBusy(false), GRACE_MS);
            return () => clearTimeout(id);
        }
        setBusy(true);
        const id = setTimeout(() => setLine(null), SHOW_MS);
        return () => clearTimeout(id);
    }, [line]);

    // saludo, una vez, al aparecer la sala (se marca como dicho solo cuando se dice de verdad)
    useEffect(() => {
        if (!active || greeted.current) return undefined;
        const id = setTimeout(() => {
            greeted.current = true;
            say(t.guide.greeting(t.guide.part(madridTime().h)));
        }, GREET_MS);
        return () => clearTimeout(id);
    }, [active, say, t]);

    // cuando desaparece el saludo, el tiempo de Madrid (si ya ha llegado)
    useEffect(() => {
        if (!active || !weather || line || !greeted.current || weatherSaid.current) return undefined;
        const id = setTimeout(() => {
            weatherSaid.current = true;
            say(t.guide.weather(weather.temp, t.weather[weather.kind]));
        }, GAP_MS);
        return () => clearTimeout(id);
    }, [active, weather, line, say, t]);

    // pistas cuando la sala está tranquila
    useEffect(() => {
        if (!active) return undefined;
        const id = setInterval(() => {
            if (line || Date.now() - lastActivity.current < QUIET_MS) return;
            const pending = allKeys.filter((key) => !discovered.has(key));
            if (!pending.length) return;
            say(t.guide.hints[pending[Math.floor(Math.random() * pending.length)]]);
        }, CHECK_MS);
        return () => clearInterval(id);
    }, [active, line, allKeys, discovered, say, t]);

    // ánimos al avanzar (no al cargar lo descubierto en otra visita)
    useEffect(() => {
        const count = discovered.size;
        if (count > lastCount.current && t.guide.milestones[count]) say(t.guide.milestones[count]);
        lastCount.current = count;
    }, [discovered, say, t]);

    return { line, busy, say, touch };
}
