import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asset = async (file, mime) =>
  `data:${mime};base64,${(await readFile(join(root, file))).toString('base64')}`;
const [background, wordmark, mark, font, pepapog, brello, android, ios] = await Promise.all([
  asset('assets/branding/readme/background.png', 'image/png'),
  asset('assets/branding/readme/vostride.svg', 'image/svg+xml'),
  asset('assets/branding/playground-mark.svg', 'image/svg+xml'),
  asset('assets/branding/readme/GeistMono-Regular.ttf', 'font/ttf'),
  asset('assets/branding/readme/screens/web-pepapog.png', 'image/png'),
  asset('assets/branding/readme/screens/web-brello.png', 'image/png'),
  asset('assets/branding/readme/screens/android-komazon.png', 'image/png'),
  asset('assets/branding/readme/screens/ios-looking.png', 'image/png'),
]);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROME_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 960 },
    deviceScaleFactor: 1,
  });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Playground by vostride</title><style>
    @font-face{font-family:GeistMono;src:url('${font}') format('truetype');font-weight:400}
    *{box-sizing:border-box}html,body{margin:0;width:1600px;height:960px;overflow:hidden}
    body{position:relative;background:#191c20;color:#1DB8CC}
    .background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .shade{position:absolute;inset:0;background:linear-gradient(180deg,#0b111521,transparent 32%,#080c1240)}
    .wordmark{position:absolute;left:62px;top:48px;width:179.16px;height:32px}
    .brand{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);width:max-content;display:flex;align-items:center;justify-content:center;z-index:5}
    .mark{width:65px;height:78px;flex:none}
    h1{margin:0;font:400 104px/1.2 GeistMono,monospace;letter-spacing:-6.76px}
    .devices{position:absolute;inset:0}
    .browser{position:absolute;border:1px solid #6e7786;border-radius:14px;background:#14191f;padding:5px;box-shadow:0 32px 80px #0009,0 4px 10px #0008,inset 0 1px 0 #ffffff40}
    .chrome{height:28px;display:flex;align-items:center;position:relative;padding:0 9px;color:#9ca8b8;font:10px GeistMono,monospace;letter-spacing:.1px}
    .dots{display:flex;gap:5px}
    .dots i{width:6px;height:6px;border-radius:100%;background:#fe6e67}
    .dots i:nth-child(2){background:#f7c45a}.dots i:nth-child(3){background:#58c965}
    .address{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap}
    .browser img{display:block;width:100%;height:auto;border:1px solid #313a46;border-radius:3px 3px 8px 8px}
    .desktop{left:32px;top:440px;width:1000px;z-index:1}
    .board{left:210px;top:650px;width:920px;z-index:2}
    .phone{position:absolute;padding:7px;background:linear-gradient(110deg,#a7adb4,#4c535d 17%,#13161b 48%,#747a84 84%,#b3b6bb);border:1px solid #999fa9;border-radius:35px;box-shadow:0 27px 65px #000b,0 4px 10px #0009,inset 0 0 0 2px #ffffff18;z-index:3}
    .phone::before,.phone::after{content:'';position:absolute;width:3px;background:#5b626e;border:1px solid #8a9099;border-radius:2px}
    .phone::before{left:-3px;top:100px;height:47px}.phone::after{right:-3px;top:145px;height:58px}
    .display{position:relative;overflow:hidden;border-radius:27px;background:#080808;box-shadow:0 0 0 2px #060709}
    .display img{display:block;width:100%;height:auto}
    .camera{position:absolute;top:7px;left:50%;transform:translateX(-50%);background:#020304;box-shadow:0 0 0 1px #22262b}
    .android{left:1000px;bottom:0;width:270px;border-radius:23px;background:linear-gradient(110deg,#73777d,#24272c 20%,#17191d 65%,#656b76)}
    .android .display{border-radius:16px}
    .android .camera{width:9px;height:9px;border-radius:50%}
    .ios{left:1294px;bottom:0;width:270px}
    .ios .camera{width:57px;height:16px;border-radius:12px;top:9px;box-shadow:none}
    </style></head><body><img class="background" src="${background}" alt="">
    <div class="shade"></div>
    <img class="wordmark" src="${wordmark}" alt="vostride">
    <header class="brand"><img class="mark" src="${mark}" alt=""><h1 aria-label="Playground">layground</h1></header>
    <main class="devices" aria-label="Playground on web, Android and iOS">
      <section class="browser desktop" aria-label="PepaPog on web">
        <div class="chrome"><span class="dots"><i></i><i></i><i></i></span><span class="address">playground.vostride.dev/observability</span></div>
        <img src="${pepapog}" alt="PepaPog service metrics and charts">
      </section>
      <section class="browser board" aria-label="Brello on web">
        <div class="chrome"><span class="dots"><i></i><i></i><i></i></span><span class="address">playground.vostride.dev/tasks</span></div>
        <img src="${brello}" alt="Brello task board">
      </section>
      <section class="phone android" aria-label="Komazon on Android"><div class="display"><img src="${android}" alt="Komazon Android product grid"><span class="camera"></span></div></section>
      <section class="phone ios" aria-label="Looking on iOS"><div class="display"><img src="${ios}" alt="Looking iOS flight results"><span class="camera"></span></div></section>
    </main>
    </body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const output = join(root, 'assets/branding/playground-banner.png');
  await writeFile(output, await page.screenshot({ animations: 'disabled', scale: 'css' }));
  console.log(`Exported ${output} (1600×960).`);
} finally {
  await browser.close();
}
