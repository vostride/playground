# Playground

Four original, self-contained products for testing automation. Built from scratch under the MIT license. There is no backend, account service, payment processor, telemetry, or external runtime asset request.

| Product     | Web path          | What you can do                                                                                                       |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Komazon** | `/shop/`          | Sign in, browse 1,200 goods, search/filter/sort, edit your bag, complete a validated checkout, view and cancel orders |
| **Looking** | `/flights/`       | Search 4,560 flight options, compare dates and fares, select seats, book a round trip, manage bookings                |
| **PepaPog** | `/observability/` | Watch simulated charts, query 6,000 logs, inspect traces and waterfalls, create and manage alert monitors             |
| **Brello**  | `/tasks/`         | Organize 2,400 tasks across 80 boards, drag with mouse or keyboard, edit task details, filter and undo                |

The bare React Native **Playground** app opens the same four products. Each has its own bottom navigation; a header app switcher moves between products. Locally owned React Native Reusables adaptations provide dark native controls with no UI-library dependency. The app uses the same seeded TypeScript data and logic, touch gestures and an offline WebView guide. See [mobile development](mobile/README.md).

## Design and product controls

The directory contains four direct app links. Komazon opens on its catalog, Looking on flight search, PepaPog on dashboard metrics, and Brello on the task board. Page headings, empty states, and checkout steps use concise functional labels.

All four web apps use a shared dark design built with locally owned official shadcn/ui components, Tailwind CSS, and bundled Inter variable fonts. Charcoal surfaces, defined borders, readable body text, and stronger labels extend through catalogs, boards, charts, tables, checkout forms, and dialogs. Original Komazon, Looking, PepaPog, and Brello logos appear in the app directory and product headers; the native app bundles matching logo assets. See [shared UI](packages/ui/README.md) for component ownership and styling conventions.

Looking’s web travel-date picker supports previous/next month, direct month and year selection, and an exact date field with **Use date**. Native provides month arrows and exact date entry. Both accept valid calendar dates in years 0001–9999, check leap days, and reject a return before departure. Search results use the selected dates; neither picker is limited to the seeded example month.

## Run locally

Use Node **24.15.0** (`nvm use`) and npm. Run commands from this repository, not its parent workspace.

```sh
npm ci
npm run dev                  # Komazon at http://127.0.0.1:5173/shop/
npm run dev -w @playground/flights
npm run dev -w @playground/observability
npm run dev -w @playground/tasks
```

Build all four apps and view the complete site:

```sh
npm run build
npm run preview              # http://127.0.0.1:4173
```

Each app is an independent Vite build. For example, `npm run build:shop` writes only `dist/shop/`. Other app output directories remain untouched. Shared libraries are bundled into each app; there is no cross-app asset dependency.

## Sample account and repeatability

Komazon displays **Sign-in details** on its web and native sign-in screens:

- Email: `alex@example.com`
- Password: `komazon123`

Looking’s web and native payment steps display **Sample card** details and a **Use sample** action. The supplied account, traveler and payment data are fictional fixtures; there is no remote account or payment service.

Data is generated with fixed seeds and fixed reference dates. Web changes survive reloads within the current browser session through `sessionStorage`. The toolbar’s **Reset playground session** button clears stored product changes and removes the current page’s bug query. A new browser session starts fresh.

Native state stays in memory until the app process restarts. **Test controls → Reset playground session** restores all four apps’ seeded data and disables their bug switches. A normal run starts with every deliberate bug off.

## Deliberate bugs

On the web, **Test controls** opens the **Active bug** selector; its toolbar label changes to **Bug enabled** while a bug is active. Native **Test controls** contains labelled switches. Web URLs and native deep links also accept `?bug=<id>`. The active bug is labelled on both platforms.

| App     | Bug                       | Expected failure                                       |
| ------- | ------------------------- | ------------------------------------------------------ |
| Komazon | `cart-total`              | Increasing a quantity does not increase the subtotal   |
| Komazon | `checkout-validation`     | Missing shipping details are accepted                  |
| Looking | `fare-total`              | The fare upgrade is omitted from the booking total     |
| Looking | `seat-conflict`           | An occupied seat can be selected                       |
| PepaPog | `log-filter`              | A status query includes logs with other statuses       |
| PepaPog | `alert-threshold`         | An alert threshold is evaluated in the wrong direction |
| Brello  | `move-drops-label`        | Moving a task removes its labels                       |
| Brello  | `filter-ignores-assignee` | The assignee filter is ignored                         |

A passing Komazon example adds two Everyday Ceramic Mugs, checks the $48 subtotal and $53 standard-shipping total, then checks out. The same assertion fails with `/shop/?bug=cart-total`: the displayed total is $29. Browser regression tests verify the bug is reproducible and that disabling it restores normal behavior. These are product regression tests, independent of any consuming automation system.

## Verify

```sh
npx playwright install chromium
npm run check                # web + native TypeScript, core logic, registry, production build, browser flows
npm run check:site           # walks every entry in releases.json
npm run test:mobile:flows    # validates Maestro source; does not execute a device
node --test tests/mobile/*.test.mjs tests/mobile/ios/offline-*.test.mjs
npm run bundle:android -w @playground/mobile
npm run bundle:ios -w @playground/mobile
```

To check a deployed preview: `PLAYGROUND_URL=https://your-preview.pages.dev npm run check:site`.

Browser tests cover the shopping/booking/board/telemetry journeys, desktop and narrow layouts, noindex, and absence of outside requests. Browser artifacts are in `playwright-report/` and `test-results/`. Mobile JS bundles can be checked locally; **native release artifacts are built only by GitHub Actions**.

Recorded local verification on 2026-10-18 passed 32 browser tests (including five date regressions, responsive trace geometry and dialog focus), 27 core tests, web/native TypeScript checks, all four Vite builds, and both Metro JavaScript bundles with four brand assets each. The expanded native harness now passes 39 local helper tests and validation of 39 Maestro YAML files. Helper tests use fixture or mocked evidence; YAML validation checks the test definitions. Neither executes the product journeys on a device.

The five native scenarios now define checks for product forms and validation, both labelled defects per app and recovery, list refresh, persisted edits, booking and order management, navigation and the WebView, all-product reset, and process restart without clearing storage. Separate native checks cover continuous touch dragging and iOS URL delivery. Offline evidence is also a required CI check. See [native acceptance coverage](tests/mobile/README.md) for the scenario mapping and platform details.

The preceding logo candidate passed all Android journeys, touch/Undo and offline gates; its checksum and attestation were verified. Its iOS gate passed four journeys, native gestures, URLs and offline launch, but failed a monitor-save scroll lookup; the retained screenshot showed the button visible, and the helper now checks visibility without forcing centering. [MOBILE-ACCEPTANCE.md](MOBILE-ACCEPTANCE.md) records the prior binary. The October 19 mobile UI redesign changes the source fingerprint and requires a fresh native build and device verification. No candidate is a published release. Exact runtime results and remaining deployment/release work are recorded in [IMPLEMENTATION-AUDIT.md](IMPLEMENTATION-AUDIT.md).

## Releases and deployment

[releases.json](releases.json) is the sample-flow registry. Entries are currently **candidates**, not a claim of a published release. Promote an entry to `released` only after its live deployment is verified, and append an immutable mobile entry after release assets and checksums exist. The registry check prevents edits/removal of already released entries relative to a supplied base revision. Existing names, paths, tested text and flows must stay stable; redesigns need a new path/version.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Cloudflare Pages, preview reports, mobile release assets and external configuration. The repository includes CI configuration; configuring it does not itself publish the apps.

## Layout

```text
web/
  shop/                Komazon web app
  flights/             Looking web app
  observability/       PepaPog web app
  tasks/               Brello web app
mobile/                Bare React Native Android + iOS project
packages/core/         Shared data and product logic
packages/ui/           Shared web components, theme and logos
public/                App launcher, headers and routing
scripts/               Build, server and release tooling
tests/e2e/             Browser product flows
tests/mobile/          Native product flows and artifact checks
```

The playground has no dependency on its consumers or their private evaluations.
