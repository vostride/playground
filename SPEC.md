# Playground

Apps to test agent-qa against, built like real products rather than toy samples. After
`agent-qa init`, a new user's sample tests run on the playground, so everyone starts from the same
apps and the same result.

The repo is public under the MIT license, so people can see exactly what they're testing, and GitHub
Actions is free for it.

The playground is not agent-qa's sample tests (those live in agent-qa's `init` scaffold), not a
demo of agent-qa, and not part of agent-qa's evaluations.

## What it contains

### Web apps

Static sites under `playground.vostride.dev`, one path per app. Each app has its own made-up name,
shown on its pages and in its page titles (`<page> · <name>`, for example `Cart · Komazon`). Paths
stay plain words.

Use a dark shadcn/ui interface with readable text and an original simple logo for each product.
Navigation is flat, without boxed active pills or accent strips. Rectangular UI uses 0–2px corners.
Use compact spacing, transparent sections and divider-separated rows instead of card containers.
Komazon retains a responsive product grid with flat tiles and no enclosing card borders.
Brello’s draggable tasks use compact cards with subtle fills, thin borders and 2px corners; its columns and shell stay flat.
Open directly on the catalog, flight search, metrics dashboard, or task board. The directory is
an app launcher with names and logos. Omit marketing heroes, slogans, welcome copy, and decorative
introductory sections. The web and mobile launchers include a compact agent-qa banner with “Your AI QA engineer” linking to
`https://github.com/vostride/agent-qa` and a “by vostride” footer linking to `https://vostride.com/`, as requested by the owner.
Looking's calendar supports any valid past or future date, with direct
date entry and month/year navigation.

| App | Path | Inspired by | What it exercises |
|---|---|---|---|
| Looking, flight booking | `/flights` | booking.com | Search with airport autocomplete and date-range and passenger pickers; results with filters, sorting and a price calendar; fare choice; a seat map; a multi-step checkout with validation; managing a booking |
| PepaPog, observability | `/observability` | Datadog | Dashboards of time-series charts with a time-range picker and live-updating widgets; a log explorer with a query bar, facets and a virtualized table; trace waterfalls; an alert builder with complex forms |
| Brello, task boards | `/tasks` | Trello, Jira | Boards with drag and drop between and within columns, by mouse and keyboard; inline editing; a card panel with labels, assignees, checklists and due dates; filters and undo |
| Komazon, a shop | `/shop` | a small store | The starter app: sign-in, catalog, cart, checkout and orders. agent-qa v2's `init` samples use it |

### Mobile app

One bare React Native app called Playground: a super app whose home screen opens mobile versions of
Looking, Brello, PepaPog and Komazon. Together they cover tab and stack navigation, forms with the
keyboard, date and option pickers, switches, bottom sheets and modals, long lists, pull to refresh,
drag and drop by touch, gestures, a WebView screen, and a deep link into each flow.

Use a compact dark interface with readable typography and locally owned shadcn-style
native components. Each product has its own bottom tabs, such as Komazon's Shop,
Cart, Orders and Profile; the header app chooser switches between products.
Playground's app icon is a cyan P formed from Vostride's original spiral and a
straight stem, following the supplied sketch. Bundle its vector and raster assets
locally, including Android adaptive/themed icons and the iOS icon catalog.

| Platform | Form | Where |
|---|---|---|
| Android | An APK | A release asset of this repo |
| iOS | A simulator build (a zipped `.app`) | A release asset of this repo |

- **Same flows on web and mobile.** Where a flow exists on both, it matches, so one plain-English
  test runs on web, Android and iOS.
- **iOS ships as a simulator build, not an `.ipa`.** An `.ipa` only runs on real iPhones and must be
  signed per device or team. Real iPhones are out of scope, and simulator builds need no signing.
- **More apps later.** A new product gets its own name, its own path on the web and its own sub-app in
  the mobile app.

## Stack

- **Web:** React and TypeScript, built with Vite into static files and served by Cloudflare Pages.
  Every app, Komazon included, is its own build under its own path, so changing one app never
  touches another's files. No server framework is needed, because the apps have no server by design.
- **Mobile:** bare React Native (the React Native CLI, no Expo).
- **Shared:** one repo with workspaces for the web apps, the mobile app and shared TypeScript packages
  for seeded data and product logic, so web and mobile show the same data and behave the same way.

## Rules

1. **Realistic.** Each app is built like a real product, with real-looking data in realistic volumes
   (thousands of rows), loading, empty and error states, and the rough edges real apps have, such as
   canvas charts, icon-only buttons and custom widgets. agent-qa has to handle them.
2. **Original.** Inspired by well-known products, but with its own names, design and assets. Never
   their branding.
3. **Self-contained and repeatable.** The apps run entirely in the browser or on the device. Data is
   generated in the app from a fixed seed, so every fresh session shows the same data, and anything
   "live" is simulated. There's no backend, no real accounts, no personal data and no payments.
   Login credentials are printed on the page.
4. **Nothing hidden.** Everything the apps need ships with them: fonts, icons, images and data. No
   analytics, trackers or outside network calls. The mobile app asks for no permissions.
   Launcher brand links open the external browser only after the user selects them;
   they are never fetched or prefetched by the apps.
5. **Product-focused screens.** Show only functional product copy and controls. Apart from the requested agent-qa launcher banner and Vostride attribution, omit promotional introductions and simulation disclaimers. Web pages remain `noindex`.
   Bot challenges are off, because automated agents are the intended visitors.
6. **Stable.** Released names, paths, texts and flows never change in place, because people's tests
   depend on them. The repo keeps a list of what has been released, and the site check walks it. A
   redesign ships under a new path or a new app version, and released mobile builds are never
   replaced.
7. **Deliberate bugs are opt-in and labelled.** Each app has a few. Each sits behind its own switch
   (`?bug=<name>` on the web, a deep link or debug menu in the mobile app), is listed in the app, and
   never affects the passing samples. A failing sample test shows agent-qa catching one.
8. **Independent.** The playground knows nothing about agent-qa or its evaluations. agent-qa's private
   evaluations may pin a playground version and add their own checks around it.

## Distribution

- **Web:** Cloudflare Pages builds and deploys `main` to `playground.vostride.dev`. Branches get
  preview deploys. Before a deploy, a site check walks every released sample flow on the preview and
  reports anything broken. It reports; it never blocks.
- **Mobile:** each version of the super app is a GitHub Release of this repo with two files: the APK
  and the zipped iOS simulator app, each with a SHA-256 checksum. CI builds and publishes them on
  GitHub's runners (macOS for the iOS build), with build attestations. Release builds never happen on
  a developer's machine. A release is never edited; a new build is a new release. agent-qa pins one
  release and its checksums, and `agent-qa init` downloads both files from it, so users get exactly
  the build agent-qa was tested with.
  Each push to `main` builds its latest commit and publishes after both platform checks pass.
  Versions use the commit's UTC date and seven-character hash: `yy.mm.dd-<hash>`;
  tags use `mobile-<version>`. A multi-commit push releases only its latest commit.
  Rerunning a published commit preserves its existing assets. All building and publication happen
  in GitHub Actions; a release manifest records the full source commit and both artifact checksums.

## Starting point

- **Built fresh.** Every app, Komazon included, is built here from scratch. Nothing is copied from
  agent-qa's private evaluation repo, which keeps its own simple shop for its own checks.
- **Komazon comes first.** It's the smallest app and the one agent-qa v2's `init` samples use:
  sign-in, catalog, cart, checkout and orders, with at least one labelled bug for the failing sample
  test.
- **Afterwards,** agent-qa's spec points to the playground for the hosted site, and the evaluation
  repo's shop stays a private test fixture that's never deployed.
- **For reference only,** the evaluation repo's mobile test app has a working Android build setup that
  can guide the super app's, which is a new app.

## Timeline

- **Now, for agent-qa v2:** Komazon, built in React and TypeScript and live at
  `playground.vostride.dev/shop`. agent-qa's `init` points its web sample tests at it. The v2 release
  waits on it, so it comes before the bigger apps.
- **Next:** Looking, PepaPog and Brello on the web, released one at a time. They don't block
  agent-qa.
- **For agent-qa v3:** the Playground mobile app, built in CI and released from this repo for Android
  and the iOS simulator. `agent-qa init` downloads the pinned release and adds mobile sample tests,
  which run on agent-qa's mobile runtime. New sample tests can use the bigger apps, and a released
  sample path never changes.

## Mobile scope decisions

- Deliberate bugs are available through the labelled **Test controls** panel and
  `?bug=<id>` deep links. Every bug is off by default.
- The first mobile release includes Komazon, Looking, Brello and PepaPog.
