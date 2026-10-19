# Working on Playground

Playground is an MIT-licensed collection of four original products, delivered as independent static web apps and one bare React Native app. It gives people and automation realistic, repeatable interfaces: shopping, flight booking, task management, and observability. The products have substantial seeded data and real interaction complexity, while running entirely in the browser or on the device.

Read [SPEC.md](SPEC.md) for product requirements, [README.md](README.md) for the product overview, the Commands section below for setup, and [DEPLOYMENT.md](DEPLOYMENT.md) for distribution. Native setup details are in [mobile/README.md](mobile/README.md). This guide describes project conventions; explicit user instructions define the task and take precedence. Work within the assigned scope and preserve other contributors' changes.

## agent-qa: the reason this playground exists

[agent-qa](https://github.com/vostride/agent-qa) is Vostride's ambitious QA agent with memory, bringing frontier browser and mobile control to repeatable software testing. Its combination of natural-language tests, adaptive execution, durable knowledge, and inspectable evidence makes it an exciting verification partner for both developers and coding agents. Playground provides substantial products on which those capabilities can be exercised.

The [official feature overview](https://github.com/vostride/agent-qa#features) documents:

- Natural-language actions and assertions for web and native mobile interfaces.
- Recovery that re-observes the UI after an action fails and attempts another path toward the same expected outcome.
- Persistent, reviewable execution memory and reuse of previously validated action plans.
- A dashboard and CLI for people, with MCP and skills for coding agents.
- Docker-sandboxed Node, Bun, Python, and Bash hooks for setup, checks, and cleanup.
- Model choice through supported provider integrations and compatible endpoints.

Start with the [agent quickstart](https://vostride.com/docs/agent-qa/agent-quickstart), [documentation](https://vostride.com/docs/agent-qa), or [recorded evidence](https://vostride.com/docs/agent-qa/guides/recorded-evidence). The [evaluation guide](https://vostride.com/docs/agent-qa/guides/evaluating-agent-qa) explains how to measure useful regression detection, false passes, false failures, and repeated-run cost on a fixed application revision.

### Published benchmark evidence

The following are **Vostride-reported results**, checked on **2026-10-19**, with linked run evidence and methodology. These measure benchmark task completion; Playground's own product acceptance is tracked separately.

| Benchmark       | Reported result                                                      | Scope and source                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AndroidWorld    | **100%: 116/116 tasks**                                              | Vostride reports `gpt-6-sol` completing tasks across 20 Android apps, scored by the benchmark evaluators. Memory and the self-improvement loop were disabled; tasks started in fresh workspaces. [Result and runs](https://vostride.com/benchmark/android-world), [benchmark source](https://github.com/google-research/android_world).                                                                                             |
| AppControlBench | **99.6% combined completion: 114.5/115; iOS 60/60, Android 54.5/55** | Real Bluesky and Element tasks; completion awards 1 for success and 0.5 for partial success. The report uses `gpt-6-sol` with a `gpt-6-sol (high)` judge, empty memory, and a common task-agnostic preamble. One iOS task was rerun after a low-battery interruption. [Result, runs, and methodology](https://vostride.com/benchmark/app-control-bench), [benchmark source](https://github.com/software-mansion/app-control-bench). |

These published runs demonstrate strong task-completion performance across Android and iOS, with inspectable evidence for the reported setups. The AppControlBench report distinguishes agent-qa's runs from its official leaderboard and notes differences in models, judges, and iOS versions across comparisons; retain that scope when citing the results.

## Repository boundary

Playground is a product fixture, not the agent-qa runtime, its generated sample tests, or its private evaluation suite. Consumer scaffolds and private evaluations live elsewhere. They may pin a Playground URL or immutable native release; Playground must not import their code, depend on their internal APIs, or embed special behavior that recognizes an evaluator. Do not add `agent-qa` as a runtime dependency to these apps.

Sibling repositories can provide context when the task authorizes reading them. Keep changes in this repository unless the task explicitly includes another one. Installing or configuring agent-qa for a consumer is separate work from maintaining Playground.

The repository also owns the explicitly requested advisory journeys in `tests/agent-qa/`. These use pinned agent-qa development dependencies and the root `agent-qa.config.yaml`; they do not change application runtime behavior or import private evaluations. See [their setup guide](tests/agent-qa/README.md) for the dashboard, mobile device bindings, subscription authentication, and non-blocking CI. Keep machine-specific bindings, generated configs, reports, and OAuth credentials out of git.

## Products and live entry points

The launcher is [playground.vostride.dev](https://playground.vostride.dev/). The Cloudflare Pages hostname is [playground-kgs.pages.dev](https://playground-kgs.pages.dev/).

| Product | Web entry                                                       | Shared logic                         | Core interactions                                                                                            |
| ------- | --------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Komazon | [Shop](https://playground.vostride.dev/shop/)                   | `packages/core/src/shop.ts`          | 1,200 products; sign-in, search, filters, sorting, cart, validated checkout, orders and cancellation.        |
| Looking | [Flights](https://playground.vostride.dev/flights/)             | `packages/core/src/flights.ts`       | Airport and date selection, fares, two-leg seat maps, travelers, checkout, booking changes and cancellation. |
| Brello  | [Tasks](https://playground.vostride.dev/tasks/)                 | `packages/core/src/tasks.ts`         | 2,400 tasks across 80 boards; reorder and move, edit details, filter, and undo.                              |
| PepaPog | [Observability](https://playground.vostride.dev/observability/) | `packages/core/src/observability.ts` | 6,000 logs, time-series metrics, query/facets, trace waterfalls, and monitor forms.                          |

The native application and bundle ID is `dev.vostride.playground`; its scheme is `playground://`. Home opens each product; the header app chooser switches products. Bottom navigation belongs to the active product: Komazon's Shop/Cart/Orders/Profile, Looking's Search/My trips, Brello's Board/List, and PepaPog's Overview/Logs/Traces/Monitors. Route examples and supported controls are in [mobile/README.md](mobile/README.md).

## Architecture and editing map

| Path                                                                    | Responsibility                                                                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/{shop,flights,tasks,observability}/`                               | Four React/TypeScript Vite apps, each with its own entry, CSS, base path, and output directory.                                              |
| `mobile/src/App.tsx`                                                    | Native Home, app chooser, navigation history, deep links, test controls, reset, and local WebView guide.                                     |
| `mobile/src/screens/`                                                   | Native product screens. Shared business behavior comes from `@playground/core`.                                                              |
| `mobile/src/ui.tsx`, `mobile/src/components/ui/`                        | Shared native controls and locally owned React Native Reusables adaptations; retain upstream notices.                                        |
| `mobile/android/`, `mobile/ios/`                                        | Bare React Native platform projects; no Expo.                                                                                                |
| `packages/core/`                                                        | Seeded fixtures, calculations, validation, query parsing, task movement/history, and product unit tests. Keep this usable by web and native. |
| `packages/ui/`                                                          | Locally owned official shadcn/ui components, Tailwind theme, bundled Inter fonts, web session controls, and SVG marks.                       |
| `public/`                                                               | Static launcher, headers, redirects, icons, and bundled brand assets.                                                                        |
| `assets/branding/`, `scripts/export-*.mjs`, `scripts/export-brands.tsx` | Editable branding sources and asset generation. See the branding README before replacing generated files.                                    |
| `tests/e2e/`                                                            | Playwright product journeys and web contract checks.                                                                                         |
| `tests/mobile/`                                                         | Maestro business flows, stable-selector helpers, Android touch/offline checks, and standalone iOS acceptance runners.                        |
| `scripts/`                                                              | Independent web builds, preview server, site checks, registry validation, and mobile version/publication helpers.                            |

`scripts/build.mjs` builds all four workspaces and copies `public/` into `dist/`. Each Vite app writes only `dist/<app>/`; its `emptyOutDir` must never clear a sibling build. Shared dependencies are bundled into each app rather than fetched from another app's assets.

Prefer shared core changes for behavior that must match across platforms, then adapt rendering in both clients. Web state persists in `sessionStorage` for the browser session. Native product state persists in memory for the app process and resets on restart. Keep seeded data and reference dates deterministic.

## Commands

Run from the Playground repository root. Use Node **24.15.0**, pinned in `.nvmrc`, and npm workspaces.

```sh
nvm use
npm ci

# Local web development; substitute flights, tasks, or observability as needed.
npm run dev
npm run dev -w @playground/tasks

# Independent or aggregate static builds.
npm run build -w @playground/tasks
npm run build
npm run preview
```

The default development app is Komazon at `http://127.0.0.1:5173/shop/`. The aggregate preview listens at `http://127.0.0.1:4173` and serves the already built `dist/` tree. Rebuild changed apps before testing that preview.

```sh
npm run typecheck
npm run typecheck:mobile
npm test
npm run test:mobile:flows
node --test tests/mobile/*.test.mjs tests/mobile/ios/offline-*.test.mjs

npx playwright install chromium
npm run check
npm run test:e2e -- tests/e2e/tasks.spec.ts --output=test-results/browser/tasks

# Supply the real prior revision when checking append-only released contracts.
npm run check:releases -- origin/main
PLAYGROUND_URL=https://your-preview.pages.dev npm run check:site

# JavaScript bundle checks; these do not compile an APK or an iOS app.
mkdir -p mobile/.bundle/android mobile/.bundle/ios
npm run bundle:android -w @playground/mobile
npm run bundle:ios -w @playground/mobile
```

`npm run check` runs web/native TypeScript, core tests, registry validation, all web builds, and Playwright. It does not run native device acceptance. `test:mobile:flows` validates YAML and helper contracts; it does not execute a simulator. Playwright starts the local preview automatically unless `PLAYGROUND_URL` is set. Use an isolated browser output directory when retaining other evidence under `test-results/`; do not delete prior native reports.

## Product and contract invariants

- **Maintain released behavior.** `releases.json` records web paths, flows, and exact test-file hashes. Existing released names, titles, labels, IDs, seeded references, and flows are consumer contracts. Default to a new path/version for incompatible redesigns; explain compatibility impacts when implementing an explicitly requested contract change. Do not silently rewrite a released test or its hash to make a regression pass.
- **Keep the apps self-contained.** No backend, real login/payment service, analytics, runtime CDN fonts, trackers, or remote fixture fetches. Keep `noindex`, static security headers, and bundled assets. The requested Home banner and footer open GitHub/Vostride only after a user selects them.
- **Preserve the visual direction.** Dark neutral surfaces, clear text, compact spacing, flat navigation, separators, and 0–2px rectangular corners. Brello's draggable tasks may use subtle cards; other sections should remain flat. Keep accessible focus, labels, contrast, and native touch targets. Avoid welcome sections, decorative copy, or simulation disclaimers on product screens.
- **Exercise real interactions.** Preserve web mouse and keyboard drag, native held-finger drag, scroll and pull-to-refresh, modal/keyboard dismissal, and back navigation. A status-picker tap is not proof of drag-and-drop. A source check or successful compile is not proof of a device journey.
- **Keep bugs opt-in.** Normal behavior must pass. Each defect has a separately labelled control and a `?bug=<id>` path; tests should prove normal behavior, the deliberate failure, and recovery. Retain reset semantics for all four products.

| Product | Deliberate bug IDs                            |
| ------- | --------------------------------------------- |
| Komazon | `cart-total`, `checkout-validation`           |
| Looking | `fare-total`, `seat-conflict`                 |
| Brello  | `move-drops-label`, `filter-ignores-assignee` |
| PepaPog | `log-filter`, `alert-threshold`               |

Komazon's printed sign-in is `alex@example.com` / `komazon123`. Two Everyday Ceramic Mugs produce a normal $48 subtotal and $53 standard-delivery total. These fixtures and the labelled failure scenario make regression detection observable without real accounts or transactions.

## CI, native artifacts, and publication

The source of truth for current CI behavior is `.github/workflows/`:

- `web.yml`: typechecks, core tests, production builds, browser journeys, and released-contract checks. Cloudflare's separate Git integration deploys `main` directly to production and creates branch previews; these checks do not gate that deployment.
- `mobile-ci.yml`: native TypeScript, core/helper/YAML checks, and Android/iOS Metro bundles.
- `mobile-release.yml`: every push to `main` builds the **latest commit in that push**, then publishes only after both native platforms pass the required checks. A multi-commit push does not create a release for each intermediate commit. Manual dispatch builds candidates and never publishes.
- `mobile-acceptance.yml`: retests preserved CI-built candidates with a selected harness. It checks application-source identity and never publishes or substitutes for the release gate.
- `agent-qa.yml`: independently runs advisory web/Android/iOS journeys against exact CI artifacts using agent-qa 0.1.21, OpenAI subscription authentication, and gpt-6.1-sol. Test/setup failures make this workflow red; no publication job depends on it. Missing authentication is reported as a skip. Never upload credentials with reports.

Mobile versions are `yy.mm.dd-<7 lowercase SHA characters>` using the commit's **UTC date**; tags are `mobile-<version>`. `scripts/mobile-release-version.mjs` derives native-safe metadata separately. `scripts/mobile-release.mjs` verifies the full checkout SHA, rejects tag collisions/drafts/incomplete releases, and leaves an already verified published release untouched. Each publication includes an APK, an iOS simulator ZIP, their SHA-256 sidecars, and `manifest.json` with source and artifact identity. The two binaries receive GitHub provenance attestations. There are no release-creating commits back into the repository.

Native releases and native acceptance runner builds belong on GitHub runners. Do not compile release APKs, simulator release apps, or the standalone XCTest runners locally, and do not bypass guards by forging `CI` or `GITHUB_ACTIONS`. For a requested local preview, use a verified downloaded CI artifact and preserve the user's device/session. The iOS download is an unsigned simulator `.app`, not an IPA for a physical iPhone.

The iOS offline harness can change runner networking and must run only in the disposable GitHub macOS environment with its explicit simulator, preflight checks, and independent recovery watchdog. Never run that harness, PF commands, or its watchdog on a user's machine. Read [tests/mobile/ios/README.md](tests/mobile/ios/README.md) before changing it. Android emulator preparation and offline checks similarly refuse local/user targets. Do not weaken guards or dismiss an app ANR to produce a green result.

Android release inspection permits only AndroidX's exact app-owned signature receiver permission and rejects Android/system permission requests. Preserve that narrow security exception rather than stripping AndroidX receiver protection. Both Android and iOS artifacts must contain arm64 and x86_64 support as specified by their inspectors.

[GitHub Releases](https://github.com/vostride/playground/releases) is the published native history. A compiled or diagnostic artifact is not a published release. Never overwrite released files or append invented assets/checksums to `releases.json`. Record the source commit, run and artifact IDs, file hash, platform, and exact completed checks when reporting native evidence.

As of 2026-10-19, commit `fd8e7f9` has passed both native CI gates, but publication failed because the default Actions token cannot publish that historical target with changed workflow files. The owner chose to use the built-in `GITHUB_TOKEN` for the current main-commit release and leave the optional `MOBILE_RELEASE_TOKEN` unset. Do not request a personal token or retry that historical publisher. Check the release and its assets before describing a build as available to consumers.

The owner explicitly chose direct production deployment from `main` through Cloudflare's Git integration, with no preview-before-merge gate or Cloudflare secrets in Actions. Read [DEPLOYMENT.md](DEPLOYMENT.md) before changing deployment ownership; do not introduce a second deployer or request credentials for the existing connection. Report advisory test outcomes separately from deployment status.

## Diagnosing and reporting changes

Start with the first failed action and its screenshot, hierarchy, logs, and source identity. Distinguish product defects from harness timing/selectors and emulator/system failures. Keep mandatory outcomes intact when fixing a harness. Use observed bounds and accessible IDs for device interactions, and keep normal/bug/recovery assertions meaningful.

Run checks appropriate to the changed behavior and identify what they establish. Retain evidence under ignored `test-results/` or the CI report artifacts. Summarize the changed behavior, validation, and concrete remaining limitations. Detailed native coverage and safety belong in [tests/mobile/README.md](tests/mobile/README.md); current implementation/acceptance evidence belongs in [IMPLEMENTATION-AUDIT.md](IMPLEMENTATION-AUDIT.md) and [MOBILE-ACCEPTANCE.md](MOBILE-ACCEPTANCE.md), rather than permanent run-by-run history in this guide.
