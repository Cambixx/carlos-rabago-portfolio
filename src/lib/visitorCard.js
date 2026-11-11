/**
 * Tarjeta de visitante (1200 × 630, el formato de las vistas previas en redes) que
 * se genera en el navegador al descubrir todos los objetos de la sala.
 * Devuelve una data URL PNG lista para mostrar y descargar.
 */
const W = 1200;
const H = 630;
const PINK = '#ff9ebd';
const INVADER = ['..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', '.XXXXXX.', '.X....X.', 'X......X'];

export function drawVisitorCard({ t, brand, count, total, seconds, weatherLine, locale, site, achievementsLine }) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b0d17');
    bg.addColorStop(1, '#1d1a3d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // líneas de escaneo, como en la web
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    // marco de neón
    ctx.save();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 4;
    ctx.shadowColor = PINK;
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.roundRect(36, 36, W - 72, H - 72, 22);
    ctx.stroke();
    ctx.restore();

    // invasor pixelado del terminal
    const px = 11;
    INVADER.forEach((row, r) =>
        row.split('').forEach((cell, c) => {
            if (cell !== 'X') return;
            ctx.fillStyle = PINK;
            ctx.fillRect(W - 96 - 8 * px + c * px, 84 + r * px, px - 1, px - 1);
        }),
    );

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PINK;
    ctx.font = '700 20px "Space Mono", monospace';
    ctx.fillText(t.visitor, 88, 112);

    ctx.fillStyle = '#d9d5e6';
    ctx.font = '400 30px "Space Grotesk Variable", sans-serif';
    ctx.fillText(t.explored, 88, 232);

    ctx.fillStyle = '#f7eff2';
    ctx.font = '700 104px "Space Grotesk Variable", sans-serif';
    ctx.save();
    ctx.shadowColor = 'rgba(255,80,140,0.55)';
    ctx.shadowOffsetX = -4;
    ctx.fillText(brand, 84, 340);
    ctx.restore();

    const minutes = Math.floor(seconds / 60);
    ctx.fillStyle = '#4ade80';
    ctx.font = '700 26px "Space Mono", monospace';
    const countLine = `${count}/${total} ${t.objects}`;
    ctx.fillText(countLine, 88, 420);
    if (achievementsLine) {
        ctx.fillStyle = PINK;
        ctx.fillText(achievementsLine, 88 + ctx.measureText(countLine).width + 36, 420);
    }
    ctx.fillStyle = '#d9d5e6';
    ctx.font = '400 26px "Space Mono", monospace';
    ctx.fillText(t.time(minutes, seconds % 60), 88, 462);

    ctx.fillStyle = '#9aa0b8';
    ctx.font = '400 20px "Space Mono", monospace';
    const date = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillText(weatherLine ? `${date} · ${weatherLine}` : date, 88, 540);
    ctx.textAlign = 'right';
    ctx.fillStyle = PINK;
    ctx.fillText(site, W - 88, 540);

    return canvas.toDataURL('image/png');
}
