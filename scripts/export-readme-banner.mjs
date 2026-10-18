import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asset = async (file, mime) =>
  `data:${mime};base64,${(await readFile(join(root, file))).toString('base64')}`;
const [background, wordmark, mark, font] = await Promise.all([
  asset('assets/branding/readme/background.png', 'image/png'),
  asset('assets/branding/readme/vostride.svg', 'image/svg+xml'),
  asset('assets/branding/playground-mark.svg', 'image/svg+xml'),
  asset('assets/branding/readme/GeistMono-Regular.ttf', 'font/ttf'),
]);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROME_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Playground by vostride</title><style>
    @font-face{font-family:GeistMono;src:url('${font}') format('truetype');font-weight:400}
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{position:relative;background:#191c20;color:#42c4d3}
    .background{position:absolute;inset:0;width:1200px;height:630px}
    .wordmark{position:absolute;left:64px;top:56px;width:179.16px;height:32px}
    main{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:24px}
    .mark{width:84px;height:101px;flex:none}
    h1{margin:0;font:400 80px/1.2 GeistMono,monospace;letter-spacing:-5.2px}
    </style></head><body><img class="background" src="${background}" alt="">
    <img class="wordmark" src="${wordmark}" alt="vostride">
    <main><img class="mark" src="${mark}" alt=""><h1>Playground</h1></main>
    </body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const output = join(root, 'assets/branding/playground-banner.png');
  await writeFile(output, await page.screenshot({ animations: 'disabled', scale: 'css' }));
  console.log(`Exported ${output} (1200×630).`);
} finally {
  await browser.close();
}
