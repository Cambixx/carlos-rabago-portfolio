import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import LangSwitch from './LangSwitch';

const DURATION_MS = 3600;
const BLOCKS = 48;
const CHART = { w: 560, h: 96, samples: 72 };

/** Curva de "errores" que decae hasta 0 con un poco de ruido determinista. */
function buildCurve() {
    return Array.from({ length: CHART.samples }, (_, i) => {
        const t = i / (CHART.samples - 1);
        const noise = Math.sin(i * 1.9) * 0.025 * (1 - t);
        return Math.max(0, Math.exp(-3.4 * t) + noise);
    });
}

function curvePath(values, upTo) {
    const n = Math.max(2, Math.floor(upTo * values.length));
    return values
        .slice(0, n)
        .map((v, i) => {
            const x = (i / (values.length - 1)) * CHART.w;
            const y = 6 + (1 - v) * (CHART.h - 14); // v = 1 (14 errores) arriba, v = 0 abajo
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
}

/**
 * Pantalla de arranque: simula un build en terminal y, al llegar al 100 %,
 * ofrece entrar con o sin sonido. El sonido necesita un gesto del usuario, así
 * que esa elección es también el permiso para que el navegador lo reproduzca.
 */
export default function Boot({ ready, reducedMotion, onEnter }) {
    const { t, c } = useI18n();
    const [progress, setProgress] = useState(0);
    const startRef = useRef(null);
    const curve = useMemo(buildCurve, []);
    const steps = t.boot.steps(Math.min(5, c.experience.items.length), c.projects.items.length);

    useEffect(() => {
        const duration = reducedMotion ? 500 : DURATION_MS;
        let raf;
        const tick = (now) => {
            startRef.current ??= now;
            const p = Math.min(1, (now - startRef.current) / duration);
            // arranque lento y final rápido, como un build de verdad
            setProgress(p * p * (3 - 2 * p));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [reducedMotion]);

    const done = progress >= 1 && ready;
    const stepsShown = Math.min(steps.length, Math.floor(progress * (steps.length + 0.4)));
    const pct = Math.round(progress * 100);
    const filled = Math.round(progress * BLOCKS);
    const [cmdStart, cmdProject, cmdEnd] = t.boot.cmd;

    return (
        <div className="boot" role="dialog" aria-label={t.boot.aria}>
            <LangSwitch className="boot-lang" />
            <div className="boot-inner">
                <p className="boot-cmd">
                    <span className="boot-prompt">$</span> {cmdStart} <em>{cmdProject}</em> {cmdEnd}
                </p>

                <svg className="boot-chart" viewBox={`0 0 ${CHART.w} ${CHART.h}`} aria-hidden="true">
                    {[0.25, 0.5, 0.75].map((f) => (
                        <line key={f} x1="0" x2={CHART.w} y1={CHART.h * f} y2={CHART.h * f} />
                    ))}
                    <path d={curvePath(curve, progress)} />
                </svg>
                <div className="boot-chart-legend">
                    <span>{t.boot.chart}</span>
                    <strong>{Math.max(0, Math.round(14 * (1 - progress)))}</strong>
                </div>

                {/* Todas las líneas ocupan su sitio desde el principio (aunque aún no se vean):
                    si se añadieran al vuelo, el bloque centrado crecería y saltaría (CLS). */}
                <ul className="boot-log">
                    {steps.map((text, i) => (
                        <li key={text} className={i < stepsShown ? 'is-on' : ''} aria-hidden={i >= stepsShown}>
                            <span className="ok">[ OK ]</span> {t.boot.step} {i + 1}/{steps.length} {text} <span className="check">✓</span>
                        </li>
                    ))}
                </ul>

                <p className="boot-stats">
                    {t.boot.modules} {Math.round(progress * 84)}/84 · {t.boot.warnings} 0 · {done ? t.boot.ready : t.boot.building}
                </p>

                <div className="boot-bar-label">
                    <span>{done ? t.boot.barDone : t.boot.barBuilding}</span>
                    <span>{pct}%</span>
                </div>
                <div className="boot-bar" aria-hidden="true">
                    {Array.from({ length: BLOCKS }, (_, i) => (
                        <i key={i} className={i < filled ? 'on' : ''} />
                    ))}
                </div>

                <div className="boot-actions">
                    <button type="button" className="btn btn-primary" disabled={!done} onClick={() => onEnter(true)} autoFocus>
                        {t.boot.enterSound}
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={!done} onClick={() => onEnter(false)}>
                        {t.boot.enterSilent}
                    </button>
                </div>
            </div>
        </div>
    );
}
