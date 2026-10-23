/**
 * Convierte las capturas de `src-images/projects/` en WebP ligeros dentro de
 * `public/projects/` (ancho máximo 1280 px, suficiente para las tarjetas en
 * pantallas retina). Los originales no se publican.
 *
 * Uso: npm run images
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'src-images/projects';
const OUT = 'public/projects';
const MAX_WIDTH = 1280;
const QUALITY = 78;

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));

let before = 0;
let after = 0;
for (const file of files) {
    const input = path.join(SRC, file);
    const output = path.join(OUT, `${path.parse(file).name}.webp`);
    await sharp(input).resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(output);
    const [a, b] = await Promise.all([stat(input), stat(output)]);
    before += a.size;
    after += b.size;
    console.log(`${file.padEnd(20)} ${(a.size / 1024).toFixed(0).padStart(5)} KB → ${(b.size / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`total: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`);
