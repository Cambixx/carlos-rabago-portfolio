/**
 * Audio mínimo con WebAudio, sin ficheros: un colchón grave que respira (la
 * "habitación") y clics cortos para la interfaz. Los navegadores solo dejan
 * crear el AudioContext tras un gesto, así que todo arranca desde `enableAudio`,
 * que se llama al pulsar "Entrar con sonido".
 */
let ctx = null;
let master = null;
let muted = true;
let ambientStarted = false;

const VOLUME = 0.5;

export function isAudioOn() {
    return !muted;
}

export function enableAudio() {
    muted = false;
    if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = VOLUME;
        master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.2);
    startAmbient();
}

export function disableAudio() {
    muted = true;
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}

function startAmbient() {
    if (ambientStarted || !ctx) return;
    ambientStarted = true;

    // Dos osciladores casi iguales batiendo entre sí + un LFO lento sobre el filtro.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.7;

    const pad = ctx.createGain();
    pad.gain.value = 0.05;

    [55, 55.4, 82.5].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start();
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    filter.connect(pad).connect(master);
}

/** Clic breve de teclado mecánico: ruido filtrado con envolvente muy corta. */
export function tick(pitch = 1) {
    if (muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(380 * pitch, now + 0.04);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.07);
}

let noise = null;
function noiseBuffer() {
    if (!noise) {
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
}

function noiseBurst({ at, duration, filter, from, to, gain, out = master }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(from, at);
    if (to) f.frequency.exponentialRampToValueAtTime(to, at + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + duration * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(f).connect(g).connect(out);
    src.start(at);
    src.stop(at + duration + 0.05);
}

/** Barrido de aire para los movimientos de cámara. */
export function whoosh() {
    if (muted || !ctx) return;
    noiseBurst({ at: ctx.currentTime, duration: 0.6, filter: 'bandpass', from: 280, to: 1900, gain: 0.05 });
}

/** Interruptor: dos clics secos. */
export function switchClick() {
    if (muted || !ctx) return;
    tick(0.55);
    setTimeout(() => tick(0.4), 60);
}

/** "Pop" corto y agudo para pequeños gestos (taza, planta, astronauta). */
export function pop(pitch = 1) {
    if (muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1100 * pitch, now + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
}

// ---------- música de los altavoces ----------
// Bucle lo-fi generado al vuelo: acordes suaves, arpegio, bombo y charles.
// Un AnalyserNode mide el volumen para que los conos de los altavoces latan.

const BPM = 84;
const EIGHTH = 60 / BPM / 2;
const CHORDS = [
    [57, 60, 64, 67], // Am7
    [53, 57, 60, 64], // Fmaj7
    [48, 52, 55, 59], // Cmaj7
    [55, 59, 62, 65], // G7
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
const midiToHz = (n) => 440 * 2 ** ((n - 69) / 12);

let musicBus = null;
let analyser = null;
let levels = null;
let musicTimer = null;
let nextNoteAt = 0;
let step = 0;

function voice(freq, at, duration, type, gain) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(filter).connect(g).connect(musicBus);
    osc.start(at);
    osc.stop(at + duration + 0.05);
}

function kick(at) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(g).connect(musicBus);
    osc.start(at);
    osc.stop(at + 0.32);
}

function playStep(i, at) {
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    const chord = CHORDS[bar];
    if (beat === 0) chord.forEach((n) => voice(midiToHz(n - 12), at, EIGHTH * 8, 'triangle', 0.03));
    voice(midiToHz(chord[ARP[beat]] + 12), at, EIGHTH * 0.9, 'sine', 0.045);
    if (beat % 4 === 0) kick(at);
    if (beat % 2 === 1) noiseBurst({ at, duration: 0.05, filter: 'highpass', from: 7000, gain: 0.03, out: musicBus });
}

function scheduler() {
    while (nextNoteAt < ctx.currentTime + 0.12) {
        playStep(step, nextNoteAt);
        nextNoteAt += EIGHTH;
        step = (step + 1) % (CHORDS.length * 8);
    }
}

/** Arranca la música. Necesita `enableAudio()` antes (gesto del usuario). */
export function startMusic() {
    if (!ctx || musicTimer) return;
    if (!musicBus) {
        musicBus = ctx.createGain();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        levels = new Uint8Array(analyser.frequencyBinCount);
        musicBus.connect(analyser);
        analyser.connect(master);
    }
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.8);
    nextNoteAt = ctx.currentTime + 0.05;
    step = 0;
    musicTimer = setInterval(scheduler, 25);
}

export function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer);
    musicTimer = null;
    musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
}

/** Volumen de los graves de la música, 0..1 (0 si no suena). */
export function getMusicLevel() {
    if (!analyser || !musicTimer || muted) return 0;
    analyser.getByteFrequencyData(levels);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += levels[i];
    return sum / (8 * 255);
}

// ---------- lluvia ----------
let rainNode = null;

/** Lluvia de fondo (ruido filtrado en bucle, muy bajo) cuando llueve en Madrid. */
export function setRain(on) {
    if (!ctx) return;
    if (on && !rainNode) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer();
        src.loop = true;
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 350;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 1500;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.gain.setTargetAtTime(0.045, ctx.currentTime, 1.2);
        src.connect(highpass).connect(lowpass).connect(gain).connect(master);
        src.start();
        rainNode = { src, gain };
    } else if (!on && rainNode) {
        rainNode.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
        rainNode.src.stop(ctx.currentTime + 3);
        rainNode = null;
    }
}

/** Dos notas ascendentes para "entrar" a una sección. */
export function chime() {
    if (muted || !ctx) return;
    const now = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = now + i * 0.07;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + 0.4);
    });
}
