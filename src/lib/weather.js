import { madridTime } from './time';

/**
 * Tiempo actual en Madrid desde Open-Meteo (gratuito y sin clave). La petición sale
 * del navegador de quien visita; si falla o tarda, la sala sigue con el cielo
 * calculado por la hora y sin efectos de tiempo.
 */
const ENDPOINT =
    'https://api.open-meteo.com/v1/forecast?latitude=40.4168&longitude=-3.7038' +
    '&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=Europe%2FMadrid&forecast_days=1';
const CACHE_KEY = 'madrid-weather';
const CACHE_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 5000;

// Si no hay datos de salida/puesta de sol, una aproximación razonable para Madrid.
const FALLBACK_SUN = { sunrise: 8 * 60, sunset: 19 * 60 + 30 };

/** Códigos WMO → categoría que la sala sabe pintar. */
export function weatherKind(code) {
    if (code <= 1) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    return 'cloudy';
}

const minutesOf = (isoLocal) => {
    const [h, m] = isoLocal.slice(11, 16).split(':').map(Number);
    return h * 60 + m;
};

/**
 * 'day' | 'dusk' | 'night' según la hora de Madrid. "Atardecer" es la hora antes de
 * la puesta de sol y la media hora después (y la media hora alrededor del amanecer).
 */
export function skyFor(weather, date = new Date()) {
    const { h, m } = madridTime(date);
    const now = h * 60 + m;
    const sunrise = weather?.sunrise ?? FALLBACK_SUN.sunrise;
    const sunset = weather?.sunset ?? FALLBACK_SUN.sunset;
    if ((now >= sunset - 60 && now <= sunset + 30) || Math.abs(now - sunrise) <= 30) return 'dusk';
    if (now > sunrise && now < sunset) return 'day';
    return 'night';
}

function readCache() {
    try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
        if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    } catch {
        /* sin caché */
    }
    return null;
}

function writeCache(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch {
        /* almacenamiento bloqueado */
    }
}

/** { temp, kind, sunrise, sunset } (minutos desde medianoche) o null si no hay datos. */
export async function fetchMadridWeather() {
    const cached = readCache();
    if (cached) return cached;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(ENDPOINT, { signal: controller.signal });
        if (!res.ok) return null;
        const json = await res.json();
        const data = {
            temp: Math.round(json.current.temperature_2m),
            kind: weatherKind(json.current.weather_code),
            sunrise: minutesOf(json.daily.sunrise[0]),
            sunset: minutesOf(json.daily.sunset[0]),
        };
        writeCache(data);
        return data;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
