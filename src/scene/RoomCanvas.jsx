import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { getMusicLevel } from '../lib/audio';
import { buildRoom } from './buildRoom';
import { MODELS, loadModel } from './models';
import { LOOK_LIMITS, STOPS, ZOOM_LIMITS } from './stops';

const UP = new THREE.Vector3(0, 1, 0);
const CLICK_SLOP = 6; // px de movimiento a partir de los cuales un toque cuenta como arrastre
const IDLE_AFTER = 7; // s sin tocar nada antes de que la cámara empiece a balancearse
const BLOOM = { strength: 0.5, radius: 0.55, threshold: 1.15 };
// Margen que se deja libre alrededor de la pantalla HTML: barra superior e inferior del HUD.
const SCREEN_FIT = { maxWidth: 0.9, reservedPx: 190 };

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const vec = (arr) => new THREE.Vector3(...arr);

/** Fov vertical que mantiene encuadre horizontal parecido en pantallas estrechas. */
function fovFor(baseFov, aspect) {
    if (aspect >= 1.3) return baseFov;
    const hBase = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * 1.6);
    const v = 2 * Math.atan(Math.tan(hBase / 2) / aspect);
    return Math.min(84, THREE.MathUtils.radToDeg(v));
}

/** El nombre y la pista de un objeto pueden depender del estado de la sala (p. ej. la temperatura). */
const resolve = (value, world) => (typeof value === 'function' ? value(world) : value);

/**
 * La habitación 3D. Recibe el estado (sección, si ya se entró, estado de la sala)
 * y avisa hacia arriba con callbacks. Toda la lógica de cámara vive aquí dentro
 * para que React no re-renderice en cada fotograma. El idioma se lee al montar:
 * la app vuelve a montar el componente (key={lang}) si cambia.
 *
 * Cámara: vuelo de entrada tras el boot, transiciones en arco entre secciones,
 * arrastre con inercia, rueda/pellizco para acercar y balanceo suave en reposo.
 */
export default function RoomCanvas({
    lang,
    section,
    entered,
    world,
    screenMode,
    reducedMotion,
    onSelect,
    onInteract,
    onHover,
    onExplore,
    onScreenMount,
    onReady,
    onUnsupported,
}) {
    const mountRef = useRef(null);
    const labelsRef = useRef(null);
    const roomRef = useRef(null);
    const live = useRef({});
    live.current = { section, entered, world, screenMode };
    const callbacks = useRef({});
    callbacks.current = { onSelect, onInteract, onHover, onExplore, onScreenMount, onReady, onUnsupported };

    const refreshHoverRef = useRef(null);

    useEffect(() => {
        roomRef.current?.apply(world);
        // la pista del objeto bajo el cursor depende del estado (p. ej. "apagar" → "encender")
        refreshHoverRef.current?.();
    }, [world]);

    useEffect(() => {
        const mount = mountRef.current;
        let disposed = false;
        let cleanup = () => {};

        (async () => {
            // La oficina (.glb) se descarga mientras corre el boot. Las insignias, el reloj y
            // la pantalla se pintan en canvas con las webfonts: hay que esperarlas o salen
            // con la tipografía de reserva.
            const officeLoad = loadModel(MODELS.office.url);
            // la silla es opcional: si no carga, se usa la de la oficina
            const chairLoad = loadModel(MODELS.chair.url).catch(() => null);
            try {
                await Promise.all([
                    document.fonts.load('700 30px "Space Grotesk Variable"'),
                    document.fonts.load('700 13px "Space Mono"'),
                    document.fonts.load('400 15px "Space Mono"'),
                ]);
            } catch {
                /* si falla, se dibuja con la fuente de reserva */
            }
            let office;
            let chairModel;
            try {
                [office, chairModel] = await Promise.all([officeLoad, chairLoad]);
            } catch {
                // sin la sala no hay escena: la versión plana tiene todo el contenido
                if (!disposed) callbacks.current.onUnsupported?.();
                return;
            }
            if (disposed) return;

            let renderer;
            try {
                renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
            } catch {
                callbacks.current.onUnsupported?.();
                return;
            }
            // En táctiles (móvil/tablet) se parte de menos resolución y una escena más ligera.
            const lowPower = window.matchMedia?.('(pointer: coarse)').matches ?? false;
            let pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
            renderer.setPixelRatio(pixelRatio);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // ACES: mantiene la sala en azul marino; los neones HDR quedan con núcleo casi
            // blanco y halo de color (el bloom), como un neón de verdad.
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.95;
            renderer.domElement.className = 'room-canvas';
            mount.prepend(renderer.domElement);

            const room = buildRoom({ office, chairModel, lowPower, lang });
            roomRef.current = room;
            room.apply(live.current.world);
            const { scene, hotspots } = room;
            const camera = new THREE.PerspectiveCamera(STOPS.intro.fov, 1, 0.05, 40);

            // --- postprocesado: bloom solo en lo que emite luz (valores HDR > 1) ---
            // En modo ligero se renderiza directo, sin composer.
            let composer = null;
            if (!lowPower) {
                const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
                composer = new EffectComposer(renderer, target);
                composer.addPass(new RenderPass(scene, camera));
                composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold));
                composer.addPass(new OutputPass());
            }

            // --- pantalla HTML real sobre el monitor (sección Proyectos) ------------
            const css = new CSS3DRenderer();
            css.domElement.className = 'room-css';
            mount.insertBefore(css.domElement, labelsRef.current);
            const screenEl = document.createElement('div');
            screenEl.className = 'screen-3d';
            const screenObj = new CSS3DObject(screenEl);
            screenObj.position.copy(room.screen.center).add(new THREE.Vector3(0, 0, 0.002));
            screenObj.visible = false;
            scene.add(screenObj);
            callbacks.current.onScreenMount?.(screenEl);

            // Etiquetas flotantes junto a los rombos (DOM posicionado cada fotograma).
            const labels = hotspots.map((h) => {
                const el = document.createElement('div');
                el.className = 'spot-label';
                el.innerHTML = `<span>${h.num}</span>${h.label}`;
                labelsRef.current.appendChild(el);
                return el;
            });

            // --- estado de cámara --------------------------------------------
            const pose = { pos: vec(STOPS.intro.pos), look: vec(STOPS.intro.look), fov: STOPS.intro.fov };
            let tween = null;
            let stopKey = 'intro';
            let pausedFrameDrawn = false;
            let lastScreenMode = live.current.screenMode;
            const view = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, velYaw: 0, velPitch: 0 };
            const zoom = { value: 0, target: 0 };
            const pointer = { x: 0, y: 0 };
            let aspect = 1.6;
            let lastInput = 0;
            let time = 0;

            // En modo pantalla, la parada de Proyectos se calcula para que la pantalla
            // llene la vista y el HTML quede a escala 1:1 (texto nítido).
            const screenStop = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: STOPS.projects.fov };
            const fitScreen = () => {
                const w = mount.clientWidth || 1;
                const h = mount.clientHeight || 1;
                const t = Math.tan(THREE.MathUtils.degToRad(fovFor(screenStop.fov, w / h)) / 2);
                const { center, width, height } = room.screen;
                const maxH = Math.max(0.5, (h - SCREEN_FIT.reservedPx) / h);
                const d = Math.max(width / (2 * t * (w / h) * SCREEN_FIT.maxWidth), height / (2 * t * maxH));
                screenStop.pos.set(center.x, center.y, center.z + d);
                screenStop.look.copy(center);
                const pxW = Math.round((width / (2 * d * t * (w / h))) * w);
                screenEl.style.width = `${pxW}px`;
                screenEl.style.height = `${Math.round((pxW * height) / width)}px`;
                screenObj.scale.setScalar(width / pxW);
            };

            const stopFor = (key) => {
                if (key === 'projects' && live.current.screenMode) {
                    return { pos: screenStop.pos.clone(), look: screenStop.look.clone(), fov: screenStop.fov };
                }
                const s = STOPS[key];
                return { pos: vec(s.pos), look: vec(s.look), fov: s.fov };
            };

            const startTween = (key) => {
                const to = stopFor(key);
                const toPos = to.pos;
                const dist = pose.pos.distanceTo(toPos);
                // Punto de control elevado y algo retrasado: el movimiento describe un arco.
                const ctrl = pose.pos.clone().lerp(toPos, 0.5);
                ctrl.y += 0.15 + dist * 0.12;
                ctrl.z += dist * 0.15;
                const duration = reducedMotion ? 0.001 : key === 'hero' && stopKey === 'intro' ? 2.6 : clamp(0.9 + dist * 0.28, 1.1, 1.9);
                tween = {
                    from: { pos: pose.pos.clone(), look: pose.look.clone(), fov: pose.fov },
                    to: { pos: toPos, look: to.look, fov: to.fov },
                    ctrl,
                    t: 0,
                    duration,
                };
                stopKey = key;
            };

            const tmp = new THREE.Vector3();
            const dir = new THREE.Vector3();
            const right = new THREE.Vector3();
            const target = new THREE.Vector3();
            const raycaster = new THREE.Raycaster();
            const ndc = new THREE.Vector2();
            const a = new THREE.Vector3();
            const b = new THREE.Vector3();

            const resize = () => {
                const w = mount.clientWidth || 1;
                const h = mount.clientHeight || 1;
                aspect = w / h;
                renderer.setSize(w, h);
                composer?.setPixelRatio(pixelRatio);
                composer?.setSize(w, h);
                css.setSize(w, h);
                camera.aspect = aspect;
                camera.updateProjectionMatrix();
                fitScreen();
                // si la cámara está parada en Proyectos, se reencuadra y se vuelve a dibujar
                if (stopKey === 'projects' && !tween) {
                    const s = stopFor('projects');
                    pose.pos.copy(s.pos);
                    pose.look.copy(s.look);
                }
                pausedFrameDrawn = false;
            };
            const observer = new ResizeObserver(resize);
            observer.observe(mount);
            resize();

            // --- interacción --------------------------------------------------
            const el = renderer.domElement;
            const pointers = new Map();
            let drag = null;
            let pinch = null;
            let hovered = null;
            const lastPointer = { x: 0, y: 0 };
            const canInteract = () => live.current.entered && !live.current.section;

            const pick = (clientX, clientY) => {
                const rect = el.getBoundingClientRect();
                ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
                raycaster.setFromCamera(ndc, camera);
                // Primer impacto de toda la escena: si no es un objeto clicable, lo tapa otra cosa.
                const hit = raycaster.intersectObjects(scene.children, true)[0];
                return hit?.object.userData.item ?? null;
            };

            // solo en desarrollo: acceso a la escena desde la consola / pruebas automáticas
            if (import.meta.env.DEV) window.__room = { scene, camera, pick };

            const setHovered = (item, x, y) => {
                if (item !== hovered) {
                    hovered?.setHover(false);
                    item?.setHover(true);
                    hovered = item;
                }
                el.style.cursor = item ? 'pointer' : drag ? 'grabbing' : 'grab';
                callbacks.current.onHover?.(item ? { label: resolve(item.label, live.current.world), hint: resolve(item.hint, live.current.world), x, y } : null);
            };

            const activate = (item) => {
                if (item.isHotspot) {
                    setHovered(null, 0, 0);
                    callbacks.current.onSelect?.(item.section);
                    return;
                }
                item.onClick?.();
                callbacks.current.onInteract?.({ key: item.key, id: item.id, section: item.section, focus: item.focus });
                if (item.section) setHovered(null, 0, 0);
            };
            refreshHoverRef.current = () => {
                if (hovered) setHovered(hovered, lastPointer.x, lastPointer.y);
            };

            const onPointerDown = (e) => {
                lastInput = time;
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                try {
                    el.setPointerCapture(e.pointerId);
                } catch {
                    /* puntero ya liberado: el arrastre sigue funcionando sin captura */
                }
                if (pointers.size === 2) {
                    const [p1, p2] = [...pointers.values()];
                    pinch = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) };
                    drag = null;
                    return;
                }
                drag = { x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp };
                view.velYaw = 0;
                view.velPitch = 0;
                el.style.cursor = 'grabbing';
            };

            const onPointerMove = (e) => {
                // cualquier movimiento cuenta como actividad: la cámara no se balancea mientras se apunta
                lastInput = time;
                lastPointer.x = e.clientX;
                lastPointer.y = e.clientY;
                pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
                pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
                if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

                if (pinch && pointers.size >= 2) {
                    lastInput = time;
                    const [p1, p2] = [...pointers.values()];
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    if (canInteract()) zoom.target = clamp(zoom.target + (dist - pinch.dist) * 0.006, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
                    pinch.dist = dist;
                    return;
                }
                if (drag) {
                    lastInput = time;
                    const dx = e.clientX - drag.x;
                    const dy = e.clientY - drag.y;
                    const elapsed = Math.max(8, e.timeStamp - drag.t) / 1000;
                    drag.x = e.clientX;
                    drag.y = e.clientY;
                    drag.t = e.timeStamp;
                    drag.moved += Math.abs(dx) + Math.abs(dy);
                    if (canInteract()) {
                        const kYaw = 0.0042;
                        const kPitch = 0.0032;
                        view.targetYaw = clamp(view.targetYaw + dx * kYaw, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw);
                        view.targetPitch = clamp(view.targetPitch + dy * kPitch, -LOOK_LIMITS.pitchDown, LOOK_LIMITS.pitchUp);
                        // velocidad para la inercia al soltar (rad/s, suavizada)
                        view.velYaw = view.velYaw * 0.6 + ((dx * kYaw) / elapsed) * 0.4;
                        view.velPitch = view.velPitch * 0.6 + ((dy * kPitch) / elapsed) * 0.4;
                    }
                    if (drag.moved > CLICK_SLOP && hovered) setHovered(null, e.clientX, e.clientY);
                    return;
                }
                if (canInteract()) setHovered(pick(e.clientX, e.clientY), e.clientX, e.clientY);
            };

            const onPointerUp = (e) => {
                pointers.delete(e.pointerId);
                if (pinch) {
                    if (pointers.size < 2) pinch = null;
                    return;
                }
                const wasClick = drag && drag.moved <= CLICK_SLOP;
                // si se soltó tras una pausa, sin inercia
                if (drag && e.timeStamp - drag.t > 80) {
                    view.velYaw = 0;
                    view.velPitch = 0;
                }
                drag = null;
                el.style.cursor = hovered ? 'pointer' : 'grab';
                if (wasClick && canInteract()) {
                    const item = pick(e.clientX, e.clientY);
                    if (item) activate(item);
                }
            };

            const onLeave = () => {
                if (!drag && hovered) setHovered(null, 0, 0);
            };

            const onWheel = (e) => {
                if (!canInteract()) return;
                lastInput = time;
                zoom.target = clamp(zoom.target - e.deltaY * 0.0016, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
            };

            // doble clic en una zona vacía: volver al encuadre inicial
            const onDoubleClick = (e) => {
                if (!canInteract() || pick(e.clientX, e.clientY)) return;
                view.targetYaw = 0;
                view.targetPitch = 0;
                view.velYaw = 0;
                view.velPitch = 0;
                zoom.target = 0;
            };

            el.style.cursor = 'grab';
            el.addEventListener('dblclick', onDoubleClick);
            el.addEventListener('pointerdown', onPointerDown);
            el.addEventListener('pointermove', onPointerMove);
            el.addEventListener('pointerup', onPointerUp);
            el.addEventListener('pointercancel', onPointerUp);
            el.addEventListener('pointerleave', onLeave);
            el.addEventListener('wheel', onWheel, { passive: true });

            // --- bucle --------------------------------------------------------
            const clock = new THREE.Clock();
            let readyFired = false;
            let wasExploring = false;
            // Resolución adaptativa: si la media baja de ~45 fps, se reduce el pixel ratio
            // (nunca se vuelve a subir, para no oscilar). Se ignoran los primeros segundos,
            // que incluyen la compilación de shaders.
            const perf = { frames: 0, time: 0, settleUntil: 3 };
            const adaptResolution = (dt) => {
                if (time < perf.settleUntil || pixelRatio <= 1) return;
                perf.frames += 1;
                perf.time += dt;
                if (perf.time < 1.5) return;
                if (perf.time / perf.frames > 1 / 45) {
                    pixelRatio = Math.max(1, pixelRatio - 0.25);
                    renderer.setPixelRatio(pixelRatio);
                    resize();
                }
                perf.frames = 0;
                perf.time = 0;
            };

            renderer.setAnimationLoop(() => {
                const dt = Math.min(clock.getDelta(), 0.05);
                time += dt;
                const { entered, section: active } = live.current;
                const key = !entered ? 'intro' : active || 'hero';
                if (key !== stopKey) startTween(key);
                // al cruzar el punto de corte (p. ej. al girar una tablet) cambia el encuadre de Proyectos
                if (live.current.screenMode !== lastScreenMode) {
                    lastScreenMode = live.current.screenMode;
                    if (stopKey === 'projects') startTween('projects');
                }

                if (tween) {
                    tween.t = Math.min(1, tween.t + dt / tween.duration);
                    const e = easeInOut(tween.t);
                    // Bézier cuadrática: from → ctrl → to
                    a.copy(tween.from.pos).lerp(tween.ctrl, e);
                    b.copy(tween.ctrl).lerp(tween.to.pos, e);
                    pose.pos.copy(a).lerp(b, e);
                    pose.look.copy(tween.from.look).lerp(tween.to.look, e);
                    pose.fov = tween.from.fov + (tween.to.fov - tween.from.fov) * e;
                    if (tween.t >= 1) tween = null;
                }

                // Con el panel de Proyectos abierto la escena queda tapada: se dibuja un
                // último fotograma al terminar el vuelo y se deja de renderizar.
                if (active === 'projects' && !tween) {
                    if (pausedFrameDrawn) return;
                    pausedFrameDrawn = true;
                } else {
                    pausedFrameDrawn = false;
                    adaptResolution(dt);
                }

                const free = entered && !active;
                if (!free && hovered) setHovered(null, 0, 0);
                if (!free) {
                    view.targetYaw = 0;
                    view.targetPitch = 0;
                    view.velYaw = 0;
                    view.velPitch = 0;
                    zoom.target = 0;
                } else if (!drag) {
                    // inercia tras soltar
                    view.targetYaw = clamp(view.targetYaw + view.velYaw * dt, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw);
                    view.targetPitch = clamp(view.targetPitch + view.velPitch * dt, -LOOK_LIMITS.pitchDown, LOOK_LIMITS.pitchUp);
                    const friction = Math.exp(-dt * 4.5);
                    view.velYaw *= friction;
                    view.velPitch *= friction;
                }

                // "Explorando": girado o acercado lo bastante como para que el título estorbe.
                const exploring = free && (Math.abs(view.targetYaw) > 0.22 || Math.abs(view.targetPitch) > 0.16 || zoom.target > 0.3);
                if (exploring !== wasExploring) {
                    wasExploring = exploring;
                    callbacks.current.onExplore?.(exploring);
                }

                const vk = 1 - Math.exp(-dt * 7);
                view.yaw += (view.targetYaw - view.yaw) * vk;
                view.pitch += (view.targetPitch - view.pitch) * vk;
                zoom.value += (zoom.target - zoom.value) * (1 - Math.exp(-dt * 5));

                // balanceo suave cuando nadie toca nada
                const idle = free && !reducedMotion ? clamp((time - lastInput - IDLE_AFTER) / 3, 0, 1) : 0;
                const idleYaw = Math.sin(time * 0.17) * 0.16 * idle;
                const idlePitch = Math.sin(time * 0.11) * 0.03 * idle;

                // dirección de mirada = objetivo - posición, girada por arrastre y balanceo
                dir.copy(pose.look).sub(pose.pos);
                const dist = dir.length();
                dir.normalize().applyAxisAngle(UP, view.yaw + idleYaw);
                right.crossVectors(dir, UP).normalize();
                dir.applyAxisAngle(right, view.pitch + idlePitch);

                // en Proyectos la cámara se queda quieta: es una interfaz para leer
                const parallax = free ? 0.05 : active === 'projects' ? 0 : 0.012;
                camera.position
                    .copy(pose.pos)
                    .addScaledVector(dir, zoom.value)
                    .addScaledVector(right, pointer.x * parallax)
                    .addScaledVector(UP, -pointer.y * parallax * 0.6);
                camera.lookAt(target.copy(pose.pos).addScaledVector(dir, dist));

                const fov = fovFor(pose.fov, aspect) - zoom.value * 3;
                if (Math.abs(camera.fov - fov) > 0.01) {
                    camera.fov = fov;
                    camera.updateProjectionMatrix();
                }

                hotspots.forEach((h) => {
                    h.group.visible = free;
                });
                room.update(time, dt, { musicLevel: getMusicLevel() });
                // La pantalla HTML aparece al final del vuelo hacia el monitor.
                const screenOn = Boolean(live.current.screenMode) && active === 'projects' && stopKey === 'projects' && (!tween || tween.t > 0.6);
                if (screenObj.visible !== screenOn) {
                    screenObj.visible = screenOn;
                    screenEl.classList.toggle('is-on', screenOn);
                }

                if (composer) composer.render();
                else renderer.render(scene, camera);
                css.render(scene, camera);

                // etiquetas de los rombos: proyectar su posición a pantalla
                const w = mount.clientWidth;
                const h = mount.clientHeight;
                hotspots.forEach((spot, i) => {
                    spot.group.getWorldPosition(tmp);
                    tmp.project(camera);
                    const show = free && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
                    const x = ((tmp.x + 1) / 2) * w;
                    const y = ((1 - tmp.y) / 2) * h;
                    labels[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
                    labels[i].classList.toggle('is-on', show);
                    labels[i].classList.toggle('is-hover', hovered === spot);
                });

                if (!readyFired) {
                    readyFired = true;
                    callbacks.current.onReady?.();
                }
            });

            cleanup = () => {
                renderer.setAnimationLoop(null);
                room.dispose();
                observer.disconnect();
                el.removeEventListener('dblclick', onDoubleClick);
                el.removeEventListener('pointerdown', onPointerDown);
                el.removeEventListener('pointermove', onPointerMove);
                el.removeEventListener('pointerup', onPointerUp);
                el.removeEventListener('pointercancel', onPointerUp);
                el.removeEventListener('pointerleave', onLeave);
                el.removeEventListener('wheel', onWheel);
                labels.forEach((l) => l.remove());
                scene.traverse((obj) => {
                    obj.geometry?.dispose();
                    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
                    mats.forEach((m) => {
                        m.map?.dispose();
                        m.dispose();
                    });
                });
                composer?.renderTarget1.dispose();
                composer?.renderTarget2.dispose();
                composer?.dispose();
                css.domElement.remove();
                callbacks.current.onScreenMount?.(null);
                renderer.dispose();
                el.remove();
                roomRef.current = null;
            };
        })();

        return () => {
            disposed = true;
            cleanup();
        };
        // reducedMotion se lee solo al montar: cambiarlo en caliente no es un caso real.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div ref={mountRef} className="room-mount">
            <div ref={labelsRef} className="spot-labels" aria-hidden="true" />
        </div>
    );
}
