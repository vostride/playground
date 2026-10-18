# Shared web UI

The four web applications use locally owned [shadcn/ui](https://ui.shadcn.com/) components from the official `new-york-v4` registry, downloaded on 2026-10-18. Component source lives in `src/components/ui`; imports of sibling registry components resolve locally. Their Radix primitives, Tailwind styles, icons, and Inter variable fonts are bundled with each app. No font CDN or runtime component service is used.

The package exports the shared Button, Input, Textarea, Badge, Card, Dialog, Tabs, Select, Separator, and Label families alongside `PlaygroundBanner`, `useSessionState`, and `BrandMark`. Product-specific rendering such as canvas charts, virtualized logs, drag handles, and seat maps stays in each app. Native selects remain where browser automation depends on their standard selection behavior.

`src/styles.css` defines readable typography, semantic theme colors, and Tailwind's layer order. Product styles belong in `@layer product` so component utilities can override them intentionally. Product accents use `--primary` and `--ring`; `--muted` and `--accent` remain surface colors, while `--muted-foreground` is secondary text.

The default design is dark: charcoal panels, clear borders, 14–15px body text, and stronger headings and controls. A 16px root keeps Tailwind's `text-sm` at 14px. The shared button uses semibold text as a local readability adjustment. Dialogs scroll within the viewport, and the test-controls trigger restores keyboard focus after closing.

`BrandMark` contains four original vector marks for Komazon, Looking.com, PepaPog, and Brello. Standalone SVGs live in `public/brands`; matching transparent PNGs are bundled by the native app. Logos are decorative when paired with a visible name and can receive an accessible title when used alone. The four product names are display branding; `/shop/`, `/flights/`, `/observability/`, `/tasks/`, session keys, and stable automation IDs remain unchanged.

This package styles the web products. React Native screens use native components and matching bundled logo images; they do not render shadcn components or remote web content for their product screens.

Sources: [installation](https://ui.shadcn.com/docs/installation/manual), [Vite integration](https://ui.shadcn.com/docs/installation/vite), and [theming](https://ui.shadcn.com/docs/theming). shadcn/ui is MIT licensed; see `SHADCN-LICENSE`.
