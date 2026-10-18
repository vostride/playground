import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, '.cache/playwright');
const { chromium } = await import('@playwright/test');
const mark = await readFile(join(root, 'assets/branding/playground-mark.svg'), 'utf8');
const paths = [...mark.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/>/g)].map((match) => match[1]);
if (paths.length !== 2) throw new Error('Expected the stem and original Vostride spiral.');
const [stem, spiral] = paths;
const foreground = '#1DB8CC';
const background = '#09090B';
const artwork = `<g fill="${foreground}"><path d="${stem}"/><path transform="translate(0 257) scale(1 -1)" d="${spiral}"/></g>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Playground</title><rect width="512" height="512" fill="${background}"/><g transform="translate(88 58) scale(1.02)">${artwork}</g></svg>\n`;
const write = async (file, content) => {
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
};

await write('public/brands/playground.svg', mark);
await write('public/brands/playground-icon.svg', icon);
await write('mobile/assets/icon.svg', icon);

const vector = (size, x, y, scale, color, withBackground = false) =>
  `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="${size}" android:viewportHeight="${size}">\n${withBackground ? `  <path android:fillColor="${background}" android:pathData="M0 0H${size}V${size}H0Z"/>\n` : ''}  <group android:translateX="${x}" android:translateY="${y}" android:scaleX="${scale}" android:scaleY="${scale}">\n    <path android:fillColor="${color}" android:pathData="${stem}"/>\n    <group android:translateY="257" android:scaleY="-1">\n      <path android:fillColor="${color}" android:pathData="${spiral}"/>\n    </group>\n  </group>\n</vector>\n`;
const resources = 'mobile/android/app/src/main/res';
await write(`${resources}/drawable/ic_launcher.xml`, vector(512, 88, 58, 1.02, foreground, true));
// Keep the tall P within the adaptive icon's central safe area, including circle masks.
await write(
  `${resources}/drawable/ic_launcher_foreground.xml`,
  vector(108, 29.7, 24.75, 0.15, foreground),
);
await write(
  `${resources}/drawable/ic_launcher_monochrome.xml`,
  vector(108, 29.7, 24.75, 0.15, '#FFFFFF'),
);
await write(
  `${resources}/values/icon_colors.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${background}</color></resources>\n`,
);
for (const version of [26, 33]) {
  await write(
    `${resources}/drawable-anydpi-v${version}/ic_launcher.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n${version >= 33 ? '  <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n' : ''}</adaptive-icon>\n`,
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route(/^https?:\/\//, (route) => route.abort());
  async function raster(svg, width, height = width, transparent = false) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${transparent ? 'transparent' : background}}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    return page.screenshot({ omitBackground: transparent, animations: 'disabled', scale: 'css' });
  }
  const directory = 'mobile/ios/Playground/Images.xcassets/AppIcon.appiconset';
  const contents = JSON.parse(await readFile(join(root, directory, 'Contents.json'), 'utf8'));
  for (const file of new Set(contents.images.map((image) => image.filename))) {
    const size = Number(file.match(/^AppIcon-(\d+)\.png$/)?.[1]);
    if (!size) throw new Error(`Unexpected iOS icon filename: ${file}`);
    const png = await raster(icon, size);
    if (png[25] !== 2) throw new Error('iOS app icons must be opaque RGB PNGs.');
    await write(`${directory}/${file}`, png);
    if (size === 1024) await write('public/brands/playground-icon.png', png);
  }
  await write('mobile/src/assets/brands/playground.png', await raster(mark, 128, 154, true));
  await write('.cache/playground-icon/final-preview.png', await raster(icon, 512));
  const sizes = [16, 24, 32, 48, 64, 128];
  await page.setViewportSize({ width: 600, height: 220 });
  await page.setContent(
    `<style>body{margin:0;padding:24px;background:${background};color:#a1a1aa;display:flex;align-items:center;gap:24px;font:12px system-ui}section{text-align:center;flex:none}svg{display:block;margin:auto}p{margin:12px 0}</style>${sizes.map((size) => `<section><div style="width:${size}px;height:${size}px">${icon.replace('<svg ', '<svg width="100%" height="100%" ')}</div><p>${size}px</p></section>`).join('')}`,
  );
  await write('.cache/playground-icon/sizes.png', await page.screenshot());
} finally {
  await browser.close();
}
console.log(
  'Exported Playground SVG/PNG, iOS icons, Android adaptive/themed icons and native header mark.',
);
