import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Boot from './components/Boot';
import FlatSite from './components/FlatSite';
import { BackButton, Discoveries, HeroTitle, HoverTip, MenuButton, NavPill, StatusTab, Toast } from './components/Hud';
import { PANELS } from './components/panels';
import { SECTION_IDS } from './content';
import { useI18n } from './i18n/context';
import { chime, disableAudio, enableAudio, pop, setRain, startMusic, stopMusic, switchClick, tick, whoosh } from './lib/audio';
import { RoomActionsContext } from './lib/roomActions';
import { madridTime } from './lib/time';
import { useMediaQuery } from './lib/useMediaQuery';
import { fetchMadridWeather, skyFor } from './lib/weather';
import { hasWebGL, prefersReducedMotion } from './lib/webgl';
import { DISCOVERABLE_KEYS } from './scene/objects';

// three.js va en un chunk aparte: la descarga empieza ya, pero el boot no la espera para pintarse.
const roomModule = import('./scene/RoomCanvas');
const RoomCanvas = lazy(() => roomModule);

const STORAGE_KEY = 'sala-descubiertos';
const TOAST_MS = 3200;
// Clic en la ventana: día → atardecer → noche → día.
const NEXT_SKY = { day: 'dusk', dusk: 'night', night: 'day' };

// Para ver los efectos sin esperar a que cambie el tiempo: ?weather=rain|snow|storm|fog|cloudy|clear y ?sky=day|dusk|night
const forced = (() => {
    const params = new URLSearchParams(window.location.search);
    const weather = params.get('weather');
    const sky = params.get('sky');
    return {
        weather: ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'].includes(weather) ? weather : null,
        sky: sky in NEXT_SKY ? sky : null,
    };
})();

const initialFlat = () => !hasWebGL() || new URLSearchParams(window.location.search).has('flat');
const sectionFromHash = () => {
    const id = window.location.hash.slice(1);
    return SECTION_IDS.includes(id) ? id : null;
};

// Lo descubierto se recuerda en este navegador; si el almacenamiento falla, se empieza de cero.
function loadDiscovered() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return new Set(saved.filter((k) => DISCOVERABLE_KEYS.includes(k)));
    } catch {
        return new Set();
    }
}

function saveDiscovered(set) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch {
        /* modo privado o almacenamiento bloqueado */
    }
}

export default function App() {
    const { lang, t, c, sections } = useI18n();
    const [reducedMotion] = useState(prefersReducedMotion);
    const [canRender3D] = useState(hasWebGL);
    const [flat, setFlat] = useState(initialFlat);
    const [booted, setBooted] = useState(false);
    const [sceneReady, setSceneReady] = useState(false);
    const [section, setSection] = useState(null);
    const [focus, setFocus] = useState(null);
    const [sound, setSound] = useState(false);
    const [hover, setHover] = useState(null);
    const [exploring, setExploring] = useState(false);
    // Elemento HTML que la escena coloca sobre la pantalla del monitor (CSS3D).
    const [screenHost, setScreenHost] = useState(null);
    // En pantallas anchas Proyectos se ve dentro del monitor; en móvil, como panel.
    const screenMode = useMediaQuery('(min-width: 900px) and (min-aspect-ratio: 6/5)');
    // Estado de la sala. El cielo arranca según la hora de Madrid y se afina con el tiempo real.
    const [world, setWorld] = useState(() => ({ lamp: true, sky: forced.sky ?? skyFor(null), music: false, weather: forced.weather, temp: null }));
    const [weather, setWeather] = useState(null);
    const skyTouched = useRef(Boolean(forced.sky)); // si alguien cambia la hora a mano, el tiempo real ya no la pisa
    const weatherToastShown = useRef(false);
    const [discovered, setDiscovered] = useState(loadDiscovered);
    const [toast, setToast] = useState(null);
    const overlayRef = useRef(null);
    const worldRef = useRef(world);
    const discoveredRef = useRef(discovered);
    const coffees = useRef(0);
    worldRef.current = world;

    const showToast = useCallback((text) => setToast({ id: `${Date.now()}-${Math.random()}`, text }), []);

    useEffect(() => {
        if (!toast) return undefined;
        const id = setTimeout(() => setToast(null), TOAST_MS);
        return () => clearTimeout(id);
    }, [toast]);

    const go = useCallback((id, focusLine = null) => {
        setSection(id);
        setFocus(focusLine);
        setHover(null);
        whoosh();
        if (id) chime();
        const url = id ? `#${id}` : window.location.pathname + window.location.search;
        window.history.replaceState(null, '', url);
    }, []);

    const setMusic = useCallback((on) => {
        if (on) {
            // el clic que llega aquí es un gesto del usuario: el navegador deja sonar
            enableAudio();
            setSound(true);
            startMusic();
        } else {
            stopMusic();
        }
        setWorld((w) => ({ ...w, music: on }));
    }, []);

    const toggleMusic = useCallback(() => {
        const on = !worldRef.current.music;
        setMusic(on);
        showToast(on ? t.toasts.musicOn : t.toasts.musicOff);
    }, [setMusic, showToast, t]);

    const toggleLamp = useCallback(() => {
        const w = worldRef.current;
        switchClick();
        setWorld({ ...w, lamp: !w.lamp });
        showToast(w.lamp ? t.toasts.lampOff : t.toasts.lampOn);
    }, [showToast, t]);

    const setSky = useCallback(
        (sky) => {
            skyTouched.current = true;
            whoosh();
            setWorld((w) => ({ ...w, sky }));
            showToast(t.toasts.sky[sky]);
        },
        [showToast, t],
    );

    // En la versión plana no hay cámara: "ir a una sección" es hacer scroll hasta ella.
    const navigate = useCallback(
        (id) => {
            if (flat) {
                const el = id ? document.getElementById(id) : document.querySelector('.flat');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            go(id);
        },
        [flat, go],
    );

    // `sudo contratar carlos` en el terminal
    const hire = useCallback(
        (subject) => {
            showToast(t.toasts.hired);
            window.location.href = `mailto:${c.contact.email}?subject=${encodeURIComponent(subject)}`;
        },
        [showToast, t, c],
    );

    const toggleSound = () => {
        if (sound) {
            setMusic(false);
            disableAudio();
        } else {
            enableAudio();
        }
        setSound(!sound);
    };

    const enter = (withSound) => {
        if (withSound) enableAudio();
        setSound(withSound);
        setBooted(true);
        const fromHash = sectionFromHash();
        if (fromHash) setSection(fromHash);
    };

    /** Clic en un objeto de la sala: cuenta como descubierto y luego hace lo suyo. */
    const onInteract = useCallback(
        ({ key, section: target, focus: focusLine }) => {
            if (!discoveredRef.current.has(key)) {
                const next = new Set(discoveredRef.current).add(key);
                discoveredRef.current = next;
                setDiscovered(next);
                saveDiscovered(next);
                if (next.size === DISCOVERABLE_KEYS.length) {
                    setTimeout(() => showToast(t.toasts.allFound), TOAST_MS * 0.6);
                }
            }
            if (target) {
                go(target, focusLine);
                return;
            }

            const w = worldRef.current;
            switch (key) {
                case 'lamp':
                    toggleLamp();
                    break;
                case 'window':
                    setSky(NEXT_SKY[w.sky]);
                    break;
                case 'speakers':
                    toggleMusic();
                    break;
                case 'keyboard':
                    // teclea un poco y abre el terminal del monitor con el cursor listo
                    for (let i = 0; i < 7; i++) setTimeout(() => tick(0.85 + Math.random() * 0.4), i * 65);
                    go('projects', 'terminal');
                    showToast(t.toasts.keyboard);
                    break;
                case 'mug': {
                    pop(0.8);
                    coffees.current += 1;
                    showToast(t.toasts.coffee(coffees.current));
                    break;
                }
                case 'astronaut':
                    pop(1.3);
                    showToast(t.toasts.astronaut);
                    break;
                case 'chair':
                    whoosh();
                    showToast(t.toasts.chair);
                    break;
                case 'plant':
                    pop(0.9);
                    showToast(t.toasts.plant);
                    break;
                case 'clock':
                    tick(0.6);
                    showToast(t.toasts.clock(madridTime().label));
                    break;
                default:
                    break;
            }
        },
        [go, setSky, showToast, t, toggleLamp, toggleMusic],
    );

    // Tiempo real de Madrid: no bloquea nada; si llega, ajusta el cielo y los efectos de la ventana.
    useEffect(() => {
        let cancelled = false;
        fetchMadridWeather().then((data) => {
            if (cancelled || !data) return;
            const kind = forced.weather ?? data.kind;
            setWeather({ ...data, kind });
            setWorld((w) => ({ ...w, weather: kind, temp: data.temp, sky: skyTouched.current ? w.sky : skyFor(data) }));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Una vez por visita, al entrar: qué tiempo hace ahora mismo en Madrid.
    useEffect(() => {
        if (!booted || !weather || weatherToastShown.current) return undefined;
        weatherToastShown.current = true;
        const id = setTimeout(() => showToast(t.toasts.weatherNow(weather.temp, t.weather[weather.kind])), 2800);
        return () => clearTimeout(id);
    }, [booted, weather, showToast, t]);

    // Si llueve en Madrid y el sonido está activado, se oye la lluvia.
    useEffect(() => {
        setRain(sound && (world.weather === 'rain' || world.weather === 'storm'));
    }, [sound, world.weather]);

    // Teclado: Esc vuelve a la sala, 1-4 saltan de sección, flechas recorren las secciones.
    useEffect(() => {
        if (!booted || flat) return undefined;
        const onKey = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
            if (e.key === 'Escape' && section) go(null);
            const n = Number(e.key);
            if (n >= 1 && n <= SECTION_IDS.length) go(SECTION_IDS[n - 1]);
            if (section && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                const i = SECTION_IDS.indexOf(section);
                const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + SECTION_IDS.length) % SECTION_IDS.length;
                go(SECTION_IDS[next]);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [booted, flat, section, go]);

    // Al abrir una sección, el foco pasa al panel para teclado y lectores de pantalla.
    useEffect(() => {
        if (!section) return undefined;
        // dentro del monitor el panel aparece al final del vuelo de cámara: hay que esperar a que sea visible
        const delay = section === 'projects' && screenMode ? 1300 : 0;
        const id = setTimeout(() => overlayRef.current?.focus({ preventScroll: true }), delay);
        return () => clearTimeout(id);
    }, [section, screenMode]);

    const Panel = section ? PANELS[section] : null;
    const sectionMeta = sections.find((s) => s.id === section);
    const inMonitor = section === 'projects' && screenMode && Boolean(screenHost);
    const menu = (
        <MenuButton
            sound={sound}
            onToggleSound={toggleSound}
            music={world.music}
            onToggleMusic={() => setMusic(!world.music)}
            flat={flat}
            canToggleFlat={canRender3D}
            onToggleFlat={() => {
                if (flat) setSceneReady(false);
                setFlat(!flat);
            }}
        />
    );

    const roomActions = { navigate, toggleLamp, toggleMusic, setSky, getWorld: () => worldRef.current, weather, hire };

    return (
        <RoomActionsContext.Provider value={roomActions}>
            <div className={`app ${flat ? 'is-flat' : ''}`}>
                {!flat && (
                    <Suspense fallback={null}>
                        <RoomCanvas
                            key={lang}
                            lang={lang}
                            section={section}
                            entered={booted}
                            world={world}
                            reducedMotion={reducedMotion}
                            onSelect={go}
                            onInteract={onInteract}
                            onHover={setHover}
                            onExplore={setExploring}
                            screenMode={screenMode}
                            onScreenMount={setScreenHost}
                            onReady={() => setSceneReady(true)}
                            onUnsupported={() => setFlat(true)}
                        />
                    </Suspense>
                )}
                <div className="fx-scanlines" aria-hidden="true" />
                <div className="fx-vignette" aria-hidden="true" />

                {booted && !flat && (
                    <>
                        <HeroTitle hidden={Boolean(section) || exploring} />
                        {section ? <BackButton onClick={() => go(null)} /> : <Discoveries count={discovered.size} total={DISCOVERABLE_KEYS.length} />}
                        <StatusTab />
                        {menu}
                        <NavPill section={section} onSelect={go} />
                        {!section && (
                            <p className="hint">
                                {exploring ? t.hud.hintExploring : t.hud.hint}
                            </p>
                        )}
                        <HoverTip hover={hover} />
                        <Toast toast={toast} />
                        {Panel && inMonitor &&
                            createPortal(
                                <section key={section} ref={overlayRef} tabIndex={-1} className="screen-ui" aria-label={sectionMeta.label}>
                                    <Panel focus={focus} />
                                </section>,
                                screenHost,
                            )}
                        {Panel && !inMonitor && (
                            <section key={section} ref={overlayRef} tabIndex={-1} className={`overlay overlay--${section}`} aria-label={sectionMeta.label}>
                                <div className="overlay-scroll">
                                    <Panel focus={focus} />
                                </div>
                            </section>
                        )}
                    </>
                )}

                {booted && flat && (
                    <>
                        {menu}
                        <FlatSite />
                    </>
                )}

                {!booted && <Boot ready={flat || sceneReady} reducedMotion={reducedMotion} onEnter={enter} />}
            </div>
        </RoomActionsContext.Provider>
    );
}
