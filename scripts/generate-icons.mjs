import sharp from 'sharp';
import toIco from 'to-ico';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const brandDir = join(publicDir, 'brand');
const docsDir = join(root, 'docs');

mkdirSync(brandDir, { recursive: true });
mkdirSync(docsDir, { recursive: true });

const iconSvg = readFileSync(join(brandDir, 'icon.svg'));
const ogSvg = readFileSync(join(brandDir, 'og-template.svg'));

async function resizePng(size, outPath, options = {}) {
  let pipeline = sharp(iconSvg).resize(size, size, { fit: 'contain', background: options.background });
  if (options.extend) {
    pipeline = pipeline.extend(options.extend);
  }
  await pipeline.png().toFile(outPath);
}

/** Maskable: logo in ~80% safe zone on 512 canvas */
async function writeMaskable() {
  const inner = 410;
  const logo = await sharp(iconSvg).resize(inner, inner).png().toBuffer();
  const pad = Math.floor((512 - inner) / 2);
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 37, g: 99, b: 235, alpha: 1 },
    },
  })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toFile(join(publicDir, 'pwa-512-maskable.png'));
}

async function writeFaviconIco() {
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((s) => sharp(iconSvg).resize(s, s).png().toBuffer()),
  );
  writeFileSync(join(publicDir, 'favicon.ico'), await toIco(buffers));
}

async function main() {
  copyFileSync(join(brandDir, 'icon.svg'), join(publicDir, 'icon.svg'));

  await resizePng(180, join(publicDir, 'apple-touch-icon.png'));
  await resizePng(192, join(publicDir, 'pwa-192.png'));
  await resizePng(512, join(publicDir, 'pwa-512.png'));
  await writeMaskable();
  await writeFaviconIco();

  await sharp(ogSvg).png().toFile(join(publicDir, 'og-image.png'));
  copyFileSync(join(publicDir, 'og-image.png'), join(docsDir, 'github-social-preview.png'));

  console.log('Icons generated in public/ and docs/github-social-preview.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
