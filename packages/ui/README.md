# Shared web UI

The four web applications use locally owned [shadcn/ui](https://ui.shadcn.com/) components from the official `new-york-v4` registry. Component source lives in `src/components/ui`; imports of sibling registry components resolve locally. Their Radix primitives, Tailwind styles, icons, and Inter variable fonts are bundled with each app. No font CDN or runtime component service is used.

The package exports the shared Button, Input, Textarea, Badge, Card, Dialog, Tabs, Select, Separator, and Label families alongside `PlaygroundBanner`, `useSessionState`, and `BrandMark`. Product-specific rendering such as canvas charts, virtualized logs, drag handles, and seat maps stays in each app. Native selects remain where browser automation depends on their standard selection behavior.

`src/styles.css` defines readable typography, semantic theme colors, and Tailwind's layer order. Product styles belong in `@layer product` so component utilities can override them intentionally. Product accents use `--primary` and `--ring`; `--muted` and `--accent` remain surface colors, while `--muted-foreground` is secondary text.

The default design is dark, with 14–15px body text and a 16px root that keeps Tailwind's `text-sm` at 14px. Dialogs scroll within the viewport, and the test-controls trigger restores keyboard focus after closing.

Rectangular UI uses 0–2px corners, including buttons, fields, dialogs, badges, and the app launcher. Navigation uses flat rows and active text/icon color, without a boxed active background or accent strip. Use compact transparent sections and divider-separated rows instead of card containers. Brello’s draggable task items are the exception: compact cards with a subtle fill, thin border and 2px corners. Circular avatars, status dots, radio controls, and spinners retain their functional shapes.

`BrandMark` is the source for all product artwork: Komazon's warm serif monogram, Looking's teal flight ribbons, Brello's modular geometric B, and PepaPog's pixel pug with a purple headset. PepaPog preserves the exact 16×12 sprite and palette from vostride.com's Connector Hell article (`app/(marketing)/blog/connector-hell/pixel-art.tsx`); the sprite is copied locally, with no dependency on the landing repository.

Standalone SVGs live in `public/brands`; matching transparent 128px PNGs are bundled by the native app. After editing `BrandMark`, regenerate both with `npm run export:brands` from the repository root. The exporter uses the pinned Chromium installed by `PLAYWRIGHT_BROWSERS_PATH=.cache/playwright npx playwright install chromium`. Use `npm run export:brands -- --check` to render previews into `.cache/brand-export-preview` without replacing product assets.

Logos are decorative when paired with a visible name and can receive an accessible title when used alone. The four product names are display branding; `/shop/`, `/flights/`, `/observability/`, `/tasks/`, session keys, and stable automation IDs remain unchanged.

This package styles the web products. React Native screens use native components and matching bundled logo images; they do not render shadcn components or remote web content for their product screens.

Sources: [installation](https://ui.shadcn.com/docs/installation/manual), [Vite integration](https://ui.shadcn.com/docs/installation/vite), and [theming](https://ui.shadcn.com/docs/theming). shadcn/ui is MIT licensed; see `SHADCN-LICENSE`.
