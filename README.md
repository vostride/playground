# Playground

Four original, self-contained products for testing automation. Built from scratch under the MIT license. There is no backend, account service, payment processor, telemetry, or external runtime asset request.

| Product       | Web path          | What you can do                                                                                                       |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Fernwood**  | `/shop/`          | Sign in, browse 1,200 goods, search/filter/sort, edit your bag, complete a validated checkout, view and cancel orders |
| **Wayline**   | `/flights/`       | Search 4,560 flight options, compare dates and fares, select seats, book a round trip, manage bookings                |
| **Vigil**     | `/observability/` | Watch simulated charts, query 6,000 logs, inspect traces and waterfalls, create and manage alert monitors             |
| **Corkboard** | `/tasks/`         | Organize 2,400 tasks across 80 boards, drag with mouse or keyboard, edit task details, filter and undo                |

The bare React Native **Playground** app opens the same four products. It uses the same seeded TypeScript data and logic, with native controls, touch gestures and an offline WebView guide. See [mobile development](apps/mobile/README.md).

## Run locally

Use Node **24.15.0** (`nvm use`) and npm. Run commands from this repository, not its parent workspace.

```sh
npm ci
npm run dev                  # Fernwood at http://127.0.0.1:5173/shop/
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

## Demo account and repeatability

Fernwood prints its credentials on the sign-in page:

- Email: `alex@example.com`
- Password: `fernwood123`

Wayline prints its fictional sample payment details during checkout. All account, traveler and address details are fictional. No payment is taken and nothing is sent.

Data is generated with fixed seeds and fixed reference dates. Web changes survive reloads within the current browser session through `sessionStorage`. A new browser session starts fresh. Native state stays in memory until the app process restarts. **Test controls → Reset playground session** restores all seeded data and disables bugs. A normal run starts with every deliberate bug off.

## Deliberate bugs

Use Test controls in each app, or open the app with `?bug=<id>`. The active bug is always labelled. Native switches are in Test controls; deep links also accept the same query.

| App       | Bug                       | Expected failure                                       |
| --------- | ------------------------- | ------------------------------------------------------ |
| Fernwood  | `cart-total`              | Increasing a quantity does not increase the subtotal   |
| Fernwood  | `checkout-validation`     | Missing shipping details are accepted                  |
| Wayline   | `fare-total`              | The fare upgrade is omitted from the booking total     |
| Wayline   | `seat-conflict`           | An occupied seat can be selected                       |
| Vigil     | `log-filter`              | A status query includes logs with other statuses       |
| Vigil     | `alert-threshold`         | An alert threshold is evaluated in the wrong direction |
| Corkboard | `move-drops-label`        | Moving a task removes its labels                       |
| Corkboard | `filter-ignores-assignee` | The assignee filter is ignored                         |

A passing Fernwood example adds two Everyday Ceramic Mugs, checks the $48 subtotal and $53 standard-shipping total, then checks out. The same assertion fails with `/shop/?bug=cart-total`: the displayed total is $29. Repository tests verify the bug is reproducible and that disabling it restores normal behavior. These are product regression tests, independent of any consuming automation system.

## Verify

```sh
npx playwright install chromium
npm run check                # web + native TypeScript, core logic, registry, production build, browser flows
npm run check:site           # walks every entry in releases.json
npm run bundle:android -w @playground/mobile
npm run bundle:ios -w @playground/mobile
```

To check a deployed preview: `PLAYGROUND_URL=https://your-preview.pages.dev npm run check:site`.

Browser tests cover the shopping/booking/board/telemetry journeys, desktop and narrow layouts, noindex, and absence of outside requests. Browser artifacts are in `playwright-report/` and `test-results/`. Mobile JS bundles can be checked locally; **native release artifacts are built only by GitHub Actions**.

## Releases and deployment

[releases.json](releases.json) is the sample-flow registry. Entries are currently **candidates**, not a claim of a published release. Promote an entry to `released` only after its live deployment is verified, and append an immutable mobile entry after release assets and checksums exist. The registry check prevents edits/removal of already released entries relative to a supplied base revision. Existing names, paths, tested text and flows must stay stable; redesigns need a new path/version.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Cloudflare Pages, preview reports, mobile release assets and external configuration. The repository includes CI configuration; configuring it does not itself publish the apps.

## Layout

```text
apps/shop/             Fernwood web app
apps/flights/          Wayline web app
apps/observability/    Vigil web app
apps/tasks/            Corkboard web app
apps/mobile/           Bare React Native Android + iOS projects
packages/core/         Platform-neutral seeded data and product logic
packages/ui/           Web playground banner and session state
public/                App directory, noindex headers and routing
scripts/               Independent builds, local server, registry/site checks
tests/e2e/             Browser product flows
```

The playground has no dependency on its consumers or their private evaluations.
