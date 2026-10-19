# Playground mark

The Playground P uses Vostride's original cyan spiral from
`Branding/01-Logos/Core/vostride-colored-logo.svg`, supplied by the owner.
The spiral path is preserved exactly, reflected vertically to follow the supplied
P sketch, and joined to a straight stem. The brand color remains `#1DB8CC`.

`playground-mark.svg` is the editable vector source. Run `npm run export:icon`
to regenerate the web mark and icon, native header image, opaque iOS app icons,
and Android legacy, adaptive and monochrome icons. Android's adaptive foreground
has extra inset for launcher masks. Exports use the repository's pinned
Playwright Chromium and contain no external assets.

The launchers' `agent-qa.png` is the owner's unmodified light wordmark from
`Branding/05-Products/agent-qa/agent-qa with logo - light.png`, bundled in the
web and native apps. The banner opens `https://github.com/vostride/agent-qa`;
the Vostride attribution opens `https://vostride.com/`. Both require a user selection.

## Repository banner

`playground-banner.png` is a 1600 × 960 composition of the owner's dark grain
background, white vostride wordmark, Playground mark, and bundled Geist Mono font.
It includes real Brello and PepaPog web captures and CI screenshots of Komazon on
Android and Looking on iOS, arranged in upright browser and phone frames.
The browser previews extend beyond the banner edges; both phones are fully
visible and aligned to the bottom edge, without platform captions. The Playground
wordmark stays centered. The native screenshots are copied unchanged; web captures
exclude the global test toolbar through screenshot framing. Product content is not retouched.

Inputs, screenshot provenance, and checksums are recorded in `readme/sources.json`.
Preserve the font license in `readme/Geist-OFL.txt` alongside
`readme/GeistMono-Regular.ttf`. The exporter uses only bundled assets and blocks
network requests; no simulator, account, or running app is needed to regenerate it.

Regenerate with `node scripts/export-readme-banner.mjs` from the repository root.
Set `PLAYWRIGHT_CHROME_PATH` only when using an alternate local Chromium executable.
