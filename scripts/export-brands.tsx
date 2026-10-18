import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrandMark, type BrandApp } from '../packages/ui/src/brand-mark';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.slice(2).includes('--check');
if (process.argv.slice(2).some((argument) => argument !== '--check')) {
  throw new Error('Usage: npm run export:brands [-- --check]');
}

const brands: { app: BrandApp; title: string }[] = [
  { app: 'shop', title: 'Komazon' },
  { app: 'flights', title: 'Looking' },
  { app: 'observability', title: 'PepaPog' },
  { app: 'tasks', title: 'Brello' },
];
const size = 128;
const cache = join(root, '.cache');
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(join(cache, 'brand-export-'));
// Set these before importing Playwright: its registry and browser processes must
// use this repository's pinned installation and temporary files.
process.env.PLAYWRIGHT_BROWSERS_PATH = join(cache, 'playwright');
process.env.TMPDIR = temporary;
process.env.TMP = temporary;
process.env.TEMP = temporary;

try {
  const { chromium } = await import('@playwright/test');
  const context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
    headless: true,
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    downloadsPath: join(temporary, 'downloads'),
  });
  const exports: { app: BrandApp; svg: string; png: Buffer }[] = [];
  try {
    const requests: string[] = [];
    await context.route(/^https?:\/\//, async (route) => {
      requests.push(route.request().url());
      await route.abort();
    });
    const page = await context.newPage();
    for (const { app, title } of brands) {
      const svg = `${renderToStaticMarkup(<BrandMark app={app} size={24} title={title} />, {
        identifierPrefix: `brand-${app}-`,
      })}\n`;
      if (
        !svg.includes('viewBox="0 0 24 24"') ||
        /currentColor|<script\b|<foreignObject\b/i.test(svg)
      ) {
        throw new Error(`${app}: expected a self-contained 24×24 mark with explicit colors.`);
      }
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
        <style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>
        </head><body>${svg}</body></html>`);
      const mark = page.getByRole('img', { name: title, exact: true });
      if ((await mark.count()) !== 1)
        throw new Error(`${app}: accessible product title is missing.`);
      if (
        app === 'observability' &&
        !(await mark
          .locator('rect')
          .evaluateAll(
            (pixels) =>
              pixels.length > 0 &&
              pixels.every(
                (pixel) => getComputedStyle(pixel).shapeRendering.toLowerCase() === 'crispedges',
              ),
          ))
      ) {
        throw new Error('PepaPog must preserve crispEdges pixel rendering.');
      }
      const png = await page.screenshot({
        omitBackground: true,
        animations: 'disabled',
        scale: 'css',
      });
      if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
        throw new Error(`${app}: raster output is not ${size}×${size}.`);
      }
      const pixels = await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, image.width, image.height).data;
        return {
          visible: rgba.some((value, index) => index % 4 === 3 && value > 0),
          transparent: rgba.some((value, index) => index % 4 === 3 && value === 0),
        };
      }, png.toString('base64'));
      if (!pixels.visible || !pixels.transparent) {
        throw new Error(`${app}: expected visible artwork on a transparent background.`);
      }
      exports.push({ app, svg, png });
    }
    if (requests.length)
      throw new Error(`Brand export attempted external requests: ${requests.join(', ')}`);
  } finally {
    await context.close();
  }

  // Render and validate every mark before replacing any checked-in assets.
  const svgDirectory = checkOnly
    ? join(cache, 'brand-export-preview', 'svg')
    : join(root, 'public', 'brands');
  const pngDirectory = checkOnly
    ? join(cache, 'brand-export-preview', 'png')
    : join(root, 'mobile', 'src', 'assets', 'brands');
  await mkdir(svgDirectory, { recursive: true });
  await mkdir(pngDirectory, { recursive: true });
  for (const { app, svg, png } of exports) {
    await writeFile(join(svgDirectory, `${app}.svg`), svg);
    await writeFile(join(pngDirectory, `${app}.png`), png);
    console.log(
      `${app}: SVG + transparent ${size}px PNG (${createHash('sha256').update(png).digest('hex')})`,
    );
  }
  console.log(
    checkOnly
      ? 'Preview only: .cache/brand-export-preview; product assets unchanged.'
      : 'Brand assets exported from the canonical BrandMark component.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
