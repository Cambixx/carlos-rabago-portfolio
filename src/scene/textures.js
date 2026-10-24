import * as THREE from 'three';
import { madridTime } from '../lib/time';

/** PRNG determinista: la habitación se ve igual en cada carga. */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeTexture(canvas, { repeat, anisotropy = 4 } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
    }
    return tex;
}

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

export function canvasTexture(width, height, draw, options) {
    const canvas = makeCanvas(width, height);
    draw(canvas.getContext('2d'), width, height);
    return makeTexture(canvas, options);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

/** Teclado: rejilla de teclas redondeadas, vista cenital. */
export function keyboardTexture() {
    return canvasTexture(512, 170, (ctx, w, h) => {
        ctx.fillStyle = '#d9d6e2';
        ctx.fillRect(0, 0, w, h);
        const rows = [14, 14, 13, 12, 6];
        const pad = 10;
        const rh = (h - pad * 2) / rows.length;
        rows.forEach((n, r) => {
            const rw = (w - pad * 2) / n;
            for (let c = 0; c < n; c++) {
                const x = pad + c * rw;
                const y = pad + r * rh;
                const accent = r === 0 && c === n - 1;
                ctx.fillStyle = accent ? '#ff9ebd' : '#f4f2f8';
                roundRect(ctx, x + 2, y + 2, rw - 4, rh - 4, 4);
                ctx.fill();
            }
        });
    });
}

const SCREEN = { w: 1024, h: 576 };
const TERMINAL = { x: 28, y: 324, w: 470, h: 220 };

function drawDesktop(ctx, text) {
    const { w, h } = SCREEN;
    const rand = rng(21);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1d1a3d');
    bg.addColorStop(1, '#3a2150');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(8,9,20,0.85)';
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = '#ff9ebd';
    roundRect(ctx, 14, 8, 62, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#0b0d17';
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.fillText(text.tabs[0], 22, 21);
    ctx.fillStyle = '#9aa0b8';
    ctx.fillText(text.tabs[1], 92, 21);

    const wins = [
        [28, 56, 470, 250, '#ff9ebd'],
        [514, 56, 482, 150, '#7fd6ff'],
        [514, 220, 482, 86, '#b79cff'],
        [TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, '#4ade80', true],
        [514, 324, 482, 220, '#ffd29a'],
    ];
    wins.forEach(([x, y, ww, hh, c, isTerminal]) => {
        ctx.fillStyle = isTerminal ? 'rgba(5,6,14,0.95)' : 'rgba(11,13,23,0.88)';
        roundRect(ctx, x, y, ww, hh, 10);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, y, ww, 26);
        [0, 1, 2].forEach((i) => {
            ctx.fillStyle = i === 0 ? c : 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.arc(x + ww - 18 - i * 16, y + 13, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        if (isTerminal) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '12px "Space Mono", monospace';
            ctx.fillText(text.title, x + 14, y + 17);
            return;
        }
        for (let ly = y + 44; ly < y + hh - 14; ly += 18) {
            const len = (0.25 + rand() * 0.65) * (ww - 40);
            ctx.fillStyle = rand() < 0.2 ? c : 'rgba(255,255,255,0.22)';
            ctx.fillRect(x + 18, ly, len, 6);
        }
    });
}

/**
 * Pantalla del monitor con un terminal que escribe código en bucle. `burst()`
 * acelera el tecleo y cuela un saludo (lo usa el clic en el teclado).
 * `text` = { title, tabs, greeting, script } en el idioma activo.
 * La textura se sube a la GPU como mucho ~15 veces por segundo.
 */
export function createScreen(text) {
    const SCRIPT = text.script;
    const base = makeCanvas(SCREEN.w, SCREEN.h);
    drawDesktop(base.getContext('2d'), text);
    const canvas = makeCanvas(SCREEN.w, SCREEN.h);
    const ctx = canvas.getContext('2d');
    const texture = makeTexture(canvas);

    const lines = [''];
    const queue = [];
    let scriptIndex = 0;
    let current = SCRIPT[0];
    let acc = 0;
    let pause = 0.6;
    let boost = 0;
    let caret = true;
    let blink = 0;
    let sinceDraw = 1;
    let dirty = true;

    const LINE_H = 19;
    const MAX_LINES = Math.floor((TERMINAL.h - 44) / LINE_H);

    const draw = () => {
        ctx.drawImage(base, 0, 0);
        ctx.font = '15px "Space Mono", monospace';
        const visible = lines.slice(-MAX_LINES);
        visible.forEach((line, i) => {
            ctx.fillStyle = line.startsWith('$') ? '#4ade80' : line.startsWith('>') ? '#ff9ebd' : 'rgba(255,255,255,0.8)';
            ctx.fillText(line, TERMINAL.x + 16, TERMINAL.y + 50 + i * LINE_H);
        });
        if (caret) {
            const last = visible[visible.length - 1] ?? '';
            const x = TERMINAL.x + 16 + ctx.measureText(last).width + 2;
            const y = TERMINAL.y + 50 + (visible.length - 1) * LINE_H;
            ctx.fillStyle = '#ff9ebd';
            ctx.fillRect(x, y - 13, 8, 16);
        }
        texture.needsUpdate = true;
    };

    const nextLine = () => {
        lines.push('');
        if (lines.length > 60) lines.splice(0, lines.length - MAX_LINES);
        if (queue.length) {
            current = queue.shift();
        } else {
            scriptIndex = (scriptIndex + 1) % SCRIPT.length;
            current = SCRIPT[scriptIndex];
        }
    };

    return {
        texture,
        burst() {
            boost = 2.4;
            if (!queue.length) queue.push(text.greeting);
        },
        update(dt) {
            boost = Math.max(0, boost - dt);
            blink += dt;
            sinceDraw += dt;
            if (blink > 0.5) {
                blink = 0;
                caret = !caret;
                dirty = true;
            }
            if (pause > 0) {
                pause -= dt * (boost > 0 ? 6 : 1);
            } else {
                acc += dt * (boost > 0 ? 75 : 20);
                while (acc >= 1 && pause <= 0) {
                    acc -= 1;
                    const typed = lines[lines.length - 1];
                    if (typed.length < current.length) {
                        lines[lines.length - 1] = current.slice(0, typed.length + 1);
                    } else {
                        nextLine();
                        pause = current.startsWith('$') ? 0.9 : 0.35;
                    }
                    dirty = true;
                }
            }
            if (dirty && sinceDraw > 1 / 15) {
                draw();
                dirty = false;
                sinceDraw = 0;
            }
        },
    };
}

/** Reloj analógico con la hora real de Madrid; solo se repinta al cambiar el segundo. */
export function createClock(label) {
    const S = 256;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');
    const texture = makeTexture(canvas, { anisotropy: 8 });
    let lastSecond = -1;

    const hand = (angle, length, width, color) => {
        ctx.save();
        ctx.translate(S / 2, S / 2);
        ctx.rotate(angle);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, length * 0.18);
        ctx.lineTo(0, -length);
        ctx.stroke();
        ctx.restore();
    };

    const draw = ({ h, m, s }) => {
        ctx.fillStyle = '#f2eff7';
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = '#0b0d17';
        for (let i = 0; i < 12; i++) {
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate((i / 12) * Math.PI * 2);
            ctx.fillRect(-3, -S * 0.46, 6, i % 3 === 0 ? 26 : 14);
            ctx.restore();
        }
        ctx.font = '700 15px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff6f9f';
        ctx.fillText(label, S / 2, S * 0.7);
        hand(((h % 12) + m / 60) * (Math.PI / 6), S * 0.25, 9, '#0b0d17');
        hand((m + s / 60) * (Math.PI / 30), S * 0.36, 6, '#0b0d17');
        hand(s * (Math.PI / 30), S * 0.4, 3, '#ff6f9f');
        ctx.fillStyle = '#ff6f9f';
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, 8, 0, Math.PI * 2);
        ctx.fill();
        texture.needsUpdate = true;
    };

    return {
        texture,
        update() {
            const t = madridTime();
            if (t.s !== lastSecond) {
                lastSecond = t.s;
                draw(t);
            }
        },
    };
}

/** Punto redondo y difuso para partículas (polvo). */
export function roundSprite() {
    return canvasTexture(64, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    });
}

/** Rejilla de agujeros del panel perforado. */
export function pegboardTexture() {
    return canvasTexture(
        512,
        232,
        (ctx, w, h) => {
            ctx.fillStyle = '#151a2c';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#05060d';
            for (let y = 8; y < h; y += 16) {
                for (let x = 8; x < w; x += 16) {
                    ctx.beginPath();
                    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        },
        { anisotropy: 8 },
    );
}

/** Insignia colgante: banda de color, empresa, puesto y periodo. */
export function badgeTexture({ company, role, period, accent, current }) {
    return canvasTexture(
        270,
        360,
        (ctx, w, h) => {
            ctx.fillStyle = '#f2eff7';
            roundRect(ctx, 0, 0, w, h, 14);
            ctx.fill();
            ctx.fillStyle = accent;
            ctx.fillRect(0, 0, w, 96);
            ctx.fillStyle = 'rgba(11,13,23,0.9)';
            roundRect(ctx, w / 2 - 28, 12, 56, 10, 5);
            ctx.fill();

            ctx.fillStyle = '#0b0d17';
            ctx.font = '700 13px "Space Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('CARLOS RÁBAGO', 18, 128);

            ctx.font = '700 30px "Space Grotesk Variable", sans-serif';
            wrapText(ctx, company, 18, 176, w - 36, 34);

            ctx.fillStyle = '#4b4f68';
            ctx.font = '500 15px "Space Mono", monospace';
            wrapText(ctx, role, 18, 248, w - 36, 20);

            ctx.fillStyle = '#0b0d17';
            ctx.font = '700 14px "Space Mono", monospace';
            ctx.fillText(period, 18, h - 22);

            // `current` es la etiqueta del empleo actual ("ACTUAL" / "CURRENT") o false
            if (current) {
                ctx.font = '700 11px "Space Mono", monospace';
                const pill = ctx.measureText(current).width + 22;
                ctx.fillStyle = '#0b0d17';
                roundRect(ctx, w - 18 - pill, h - 42, pill, 24, 12);
                ctx.fill();
                ctx.fillStyle = '#4ade80';
                ctx.fillText(current, w - 7 - pill, h - 26);
            }
        },
        { anisotropy: 8 },
    );
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, x, cy);
            line = word;
            cy += lineHeight;
        } else {
            line = test;
        }
    });
    if (line) ctx.fillText(line, x, cy);
}

/** Trazos de lluvia (se repite y se desplaza en vertical). */
export function rainTexture() {
    return canvasTexture(
        256,
        512,
        (ctx, w, h) => {
            const rand = rng(31);
            ctx.lineCap = 'round';
            for (let i = 0; i < 140; i++) {
                const x = rand() * w;
                const y = rand() * h;
                const len = 18 + rand() * 46;
                ctx.strokeStyle = `rgba(205,222,255,${0.18 + rand() * 0.3})`;
                ctx.lineWidth = 0.8 + rand() * 1.2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - len * 0.12, y + len);
                ctx.stroke();
            }
        },
        { repeat: [2, 1.5] },
    );
}

/** Gotas pegadas al cristal. */
export function dropletsTexture() {
    return canvasTexture(512, 450, (ctx, w, h) => {
        const rand = rng(41);
        for (let i = 0; i < 160; i++) {
            const x = rand() * w;
            const y = rand() * h;
            const r = 1.5 + rand() * rand() * 7;
            const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.75)');
            g.addColorStop(0.5, 'rgba(200,215,255,0.25)');
            g.addColorStop(1, 'rgba(200,215,255,0.05)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

/** Copos de nieve (se repite y cae despacio). */
export function snowTexture() {
    return canvasTexture(
        256,
        256,
        (ctx, w, h) => {
            const rand = rng(51);
            for (let i = 0; i < 70; i++) {
                const x = rand() * w;
                const y = rand() * h;
                const r = 1 + rand() * 2.6;
                ctx.fillStyle = `rgba(255,255,255,${0.45 + rand() * 0.5})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        { repeat: [2, 2] },
    );
}
