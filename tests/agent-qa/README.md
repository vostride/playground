# Advisory agent-qa journeys

Eight natural-language tests cover Komazon, Looking, Brello, and PepaPog on web and native mobile. They use **agent-qa 0.1.21**, the **OpenAI subscription** provider, and **gpt-6.1-sol**. The same four mobile tests run against Android and iOS through a generated platform config. These are developer dependencies; the shipped apps do not include agent-qa.

## Local dashboard and devices

Run from the repository root with Node 24.15.0:

```sh
npm ci
npm run agent-qa:configure -- web
npx agent-qa dashboard --open
```

The checked-in `agent-qa.config.yaml` is the default dashboard config. It discovers eight tests and four iOS suites. The mobile tests select Android; the iOS suites reuse the same steps and stable test IDs with an iOS target. The dashboard listens at <http://localhost:3470>. `agent-qa init` has already been run; do not use `--force` over this project config.

| Product memory key | Web target    | Android target    | iOS target    |
| ------------------ | ------------- | ----------------- | ------------- |
| `komazon`          | `web-komazon` | `android-komazon` | `ios-komazon` |
| `looking`          | `web-looking` | `android-looking` | `ios-looking` |
| `brello`           | `web-brello`  | `android-brello`  | `ios-brello`  |
| `pepapog`          | `web-pepapog` | `android-pepapog` | `ios-pepapog` |

agent-qa 0.1.21 defines each product through `registry.targets.<target>.product`; it does not have a separate `registry.products` section. Each native target launches the same installed super app. Its journey opens the appropriate product from Home.

```sh
npx agent-qa devices init
npx agent-qa devices list
```

Device bindings live in ignored `agent-qa.local.yaml`. `devices init` skips an existing file: edit its bindings when switching machines or devices. The application identifier is `dev.vostride.playground` on both platforms. Use a CI-built installed app; native release builds stay in GitHub Actions.

For iOS, choose one of the four **iOS suites** in the dashboard. To run all four iOS journeys through the CLI:

```sh
npm run agent-qa:configure -- ios
npm run agent-qa:validate
npm run agent-qa:test
```

Set `PLAYGROUND_DEVICE_ID` to a simulator UDID or Android serial before generating the platform config to select a specific device. The generated config and native test copies are ignored by git. Copies preserve test IDs and steps, changing only the target/device. They avoid v0.1.21's multi-suite JUnit overwrite and retain all four journeys in the CI report. Mobile execution also needs an Appium driver compatible with the local OS/Xcode; CI installs its own pinned drivers. Initialization alone does not install drivers or execute a device test.

## Shared product memory

Memory and its curator are enabled, stored under ignored `.agent-qa/memory/`. Observations in `products/looking/`, for example, are available to all three Looking targets. Different products retrieve their own product observations. Native test IDs stay identical across Android and iOS, so test-specific knowledge can also be reused. Memory is treated as a hypothesis; assertions still check the live interface. Platform-specific observations should identify their platform.

The local provider uses Markdown files and an in-memory SQLite search index; no embedding service is required. The curator learns from executed runs using the configured model. An empty memory view before the first learned observation is expected: the dashboard builds that view from saved observations. The v0.1.21 curator considers all observations for deduplication, although retrieval is scoped by product, suite and test.

CI restores and saves only sanitized `products/`, `suites/` and `tests/` memory directories. Auth, dashboard databases, reports and locks are excluded. Compatible snapshots are shared across web, Android and iOS and later runs; each job summary records the restored cache and save outcome. Concurrent workflow runs can start from the same snapshot, and their changes are not merged. Local memory is independent of the CI cache and is never committed. Failed tests remain advisory with memory enabled.

## Subscription authentication and CI secret

Authenticate the named profile locally:

```sh
npx agent-qa auth login --config playground-codex
node tests/agent-qa/auth.mjs export
gh secret set AGENT_QA_AUTH_JSON --repo vostride/playground \
  < tests/agent-qa/.auth-data/agent-qa/auth.json
```

The export helper reads agent-qa's auth store and writes **only** `playground-codex` into an ignored, mode-0600 file. It never exports other profiles. Alternatively, paste that exported JSON into **GitHub → vostride/playground → Settings → Secrets and variables → Actions → New repository secret**, named `AGENT_QA_AUTH_JSON`. Delete the exported copy after uploading it.

This is agent-qa's OAuth file, **not** `~/.codex/auth.json`. Its normal source is `~/.agent-qa/auth.json`, or `$XDG_DATA_HOME/agent-qa/auth.json` when that variable is set. Do not commit auth files, paste tokens into test YAML, or upload them as artifacts. Model availability depends on the authenticated subscription.

CI writes the selected profile to:

```text
$RUNNER_TEMP/playground-agent-qa-auth/agent-qa/auth.json
```

It sets `XDG_DATA_HOME` to the containing `playground-agent-qa-auth` directory, masks token values, sanitizes reports before upload, and removes the auth directory during cleanup. No OpenAI API key or additional release credential is required for these tests. If authentication expires or a refresh token is rotated/revoked, log in again and replace `AGENT_QA_AUTH_JSON`: refreshes on ephemeral runners do not update the stored GitHub secret. Platform jobs are serial within each advisory run; separate workflow runs may overlap.

## Internal CI analytics identity

The repository variable `AGENT_QA_ANALYTICS_ID` holds one generated analytics user ID. Keep it stable across runs and platforms. CI writes it to `$XDG_DATA_HOME/agent-qa/analytics.json` with `is_internal: true`, and removes that runner-local file with the auth directory after execution. This does not read or change a developer's `~/.agent-qa/analytics.json`.

agent-qa 0.1.21 normally hardcodes `u_CI`, ignoring the file in CI. Its CLI also creates separate analytics services for run reports. The CI runner therefore preloads `ci-analytics.mjs`, a compatibility shim for the pinned SDK that applies the repository's fixed ID and internal person flag at capture time, scoped to agent-qa's project. This is not a documented agent-qa configuration option; recheck it when upgrading agent-qa. `CI`, `GITHUB_ACTIONS`, and the `ci` runtime context stay intact, and no installed package files are changed. The generated CI config enables telemetry for these requested internal runs; the checked-in local config retains `analytics.privacy: true`. The identity file, auth files, and dashboard database are never cached or uploaded.

## Execution and reports

```sh
# Choose web, android, or ios. Web defaults to the hosted Playground.
npm run agent-qa:configure -- web
npm run agent-qa:validate
npm run agent-qa:test
```

Set `PLAYGROUND_BASE_URL` before configuration to test another web deployment. These tests reset product state and exercise checkout/order cancellation, arbitrary flight dates and booking, task edits/movement, and trace/monitor workflows. Local test execution reports its real exit code.

`.github/workflows/agent-qa.yml` runs separately after the trusted main-push web/mobile build workflows finish. It downloads the exact source run's static build, APK, or simulator app; it does not compile another native app. Failed tests or setup make this workflow red. Release and deployment jobs never depend on it, so publication continues independently. Remaining platforms still run after a failure, and cleanup, sanitation and report upload retain their existing always-run conditions. Missing credentials or missing build artifacts produce explicit skip reasons. Optional memory-cache restore/save failures remain warnings.

Manual dispatch requires a completed main-push source run ID. Choosing `all` resolves the counterpart web/mobile workflow at the exact same source SHA. Reports, screenshots, source identity, and exit status are retained as `agent-qa-<platform>-<run-id>` artifacts for 14 days. Report sanitization must succeed before upload. Generated local evidence stays under ignored `tests/agent-qa/reports/`.

CI mobile runs own one pinned Appium 3.8.0 server for all four journeys, bound to `127.0.0.1:4723` with the existing relaxed-security capability. Startup refuses an occupied port and requires the owned listener plus a ready `/status` response within 30 seconds. Only the agent-qa CLI receives `AGENT_QA_APPIUM_URL`. Local dashboard and web execution keep their existing Appium behavior.

Before starting Appium or agent-qa on CI iOS, the wrapper builds the installed WebDriverAgent 16.12.8 with `xcodebuild build-for-testing` for the explicit simulator UUID. It verifies XCUITest 12.12.4 and WDA are inside the isolated `APPIUM_HOME`, and uses a fresh `$RUNNER_TEMP/playground-agent-qa-wda` directory. Preparation is limited to ten minutes and must produce the runner app and exactly one nonempty simulator `.xctestrun`; failure stops execution before any journey starts. This builds only the testing runner, not another Playground app.

The iOS server defaults to `appium:isHeadless: true`, `appium:usePrebuiltWDA: true`, the prepared `appium:derivedDataPath`, and `appium:showXcodeLog: true`. Headless mode matches the simulator already booted by `simctl`; prebuilding moves compilation outside agent-qa's session request. The [pinned XCUITest guide](https://github.com/appium/appium-xcuitest-driver/blob/v12.12.4/docs/guides/run-prebuilt-wda.md) documents this build/run split. The pinned agent-qa client does not override these capabilities. Android receives no additional preparation or defaults; no runtime package is patched. Successful WDA startup and iOS journeys still need CI verification.

Appium debug output is retained in `reports/appium/server.log`; startup stdout/stderr is retained in `reports/appium/process.log`, including failures before the server becomes ready. iOS WDA compiler output is retained in `reports/appium/wda-build.log`; status records its version, simulator, output paths, `.xctestrun` checksum, and exit status. The log directory is mode 0700, including when Appium replaces its log file during startup. These logs use the same credential sanitizer as other reports and are never printed raw by the wrapper. The wrapper preserves the agent's exit code and stops only its owned children, including on SIGINT/SIGTERM. The WDA build has its own process group so cleanup can stop descendants holding output pipes. Cleanup allows five seconds for TERM and five for KILL. An `appium-writer-active.json` marker prevents sanitation, report upload, and memory caching unless the child processes, output pipes, and log handles are confirmed closed. Journey assertions and session timeouts are unchanged.

Validate helper behavior without model calls or device execution:

```sh
node --test tests/agent-qa/auth.test.mjs tests/agent-qa/memory.test.mjs tests/agent-qa/ci-analytics.test.mjs tests/agent-qa/appium.test.mjs
```
