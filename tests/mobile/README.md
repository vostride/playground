# Native acceptance flows

These Maestro flows exercise the installed bare React Native app on both Android and iOS. They operate through rendered controls, accessibility labels, test IDs, real keyboard input, sheets, deep links, and a native WebView. They do not invoke product functions or inject application state.

Android route setup uses `openLink` and retains custom-scheme coverage within Maestro. iOS business journeys use the app's bottom tabs, product navigation, task search/cards, and labelled Test controls switch through `helpers/navigate-ios.yaml`. Every route requires its product landmark; there are no retries or optional business assertions in this navigation path. The separate XCTest gate verifies iOS URL delivery.

**`NativeLinkTests` is a mandatory companion iOS gate.** The [independent XCTest target](ios/README.md) opens the installed candidate with `XCUIApplication.open`, verifies every required product/subroute and the `?bug=cart-total` label, and checks that the flag survives later URLs without a query. Maestro proves the business outcomes, visible bug arithmetic, and reset; XCTest proves native URL/query routing. Neither substitutes for the other. These direct-target URL tests do not claim coverage of SpringBoard's custom-scheme first-consent chooser.

The mobile release workflow runs `flows/` against the release APK in an Android emulator and the simulator `.app` in an iOS simulator before publishing either artifact. Runtime results, JUnit XML, screenshots, and Maestro diagnostics are retained as CI artifacts. Parsing YAML and creating JavaScript bundles are separate checks and do not prove native behavior.

## Run

With an installed app and a booted emulator or simulator:

```sh
maestro --device "$DEVICE_ID" test \
  --format junit \
  --output maestro-reports/mobile.xml \
  --test-output-dir maestro-reports/native \
  tests/mobile/flows/
```

The workflow pins Maestro 2.11.0 and verifies the downloaded archive checksum. Each flow launches a fresh session with every runtime permission denied. The release APK requests no Android/system permissions. Its only permitted custom permission is AndroidX’s app-owned signature receiver protection; it never prompts the user.

The shared CI diagnostic runner gives the iOS Maestro driver up to ten minutes to start, using the documented [`MAESTRO_DRIVER_STARTUP_TIMEOUT`](https://docs.maestro.dev/maestro-cli/run-your-first-test-with-the-maestro-cli) setting. In run `39173155632`, the cold driver became ready roughly seven minutes after CLI launch, after the former two-minute limit had already failed. The override applies only to the iOS Maestro child process and is recorded in `diagnostic-status.json`; there is one attempt, and a startup failure still fails acceptance. Product assertion timeouts, Android startup, the independent XCTest checks and the offline watchdog deadlines stay unchanged.

The iOS release job allows 120 minutes, with a separate 90-minute acceptance-step limit so an overlong gate can still upload its evidence. Recorded passing instances of the five journeys total roughly 57 minutes, excluding cold driver startup; observed setup/compilation takes about 24 minutes, followed by roughly seven minutes for the native XCTest command and two for offline verification. These measurements come from separate retained runs, not a passing combined release. The former 90-minute whole-job budget could expire during legitimate verification. Android and focused diagnostic budgets are unchanged; no assertion is skipped or retried to fit the job limit.

The iOS controls journey waits up to 60 seconds for the local WebView's `Navigation` heading before continuing. Run `39174195252` showed the native Help sheet with a blank body after 17 seconds; the same binary's later offline XCTest rendered and verified the heading and full paragraph. The bounded wait tests content readiness without reopening the sheet, reloading the app, or making the content assertion optional. Its effectiveness still requires a new device result.

For local source validation only:

```sh
npm run test:mobile:flows
```

APK metadata inspection is shared by release and diagnostic acceptance:

```sh
node --test tests/mobile/inspect-apk.test.mjs
node tests/mobile/inspect-apk.mjs path/to/app-release.apk
```

With Android build-tools 36.0.0 available through `ANDROID_HOME` or `ANDROID_SDK_ROOT`, the inspector saves permission, binary manifest, architecture and JSON reports under `maestro-reports/android/`. It requires `dev.vostride.playground` and both `arm64-v8a` and `x86_64`. The sole permission allowance requires an exact matching declaration and request for `dev.vostride.playground.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, with protection level exactly `signature` (`0x2`). Every other request, including SDK-specific aliases and Internet access, fails. AndroidX uses this [signature permission](https://raw.githubusercontent.com/androidx/androidx/androidx-main/core/core/src/main/AndroidManifest.xml) to [protect non-exported receivers on older Android versions](https://raw.githubusercontent.com/androidx/androidx/androidx-main/core/core/src/main/java/androidx/core/content/ContextCompat.java); [signature permissions are granted by certificate matching](https://developer.android.com/guide/topics/manifest/permission-element#plevel), without a runtime prompt.

Release jobs additionally pass the derived `versionName` and `versionCode` to `inspectApk`, requiring exact binary values and `Playground` for every resolved application locale and launcher label. The standalone command above records observed metadata for a diagnostic artifact; it does not infer expected versions from the current CI run.

On macOS, `node tests/mobile/inspect-ios.mjs path/to/Playground.app` reads the compiled bundle's processed plist and executable without building or launching it. The release workflow supplies explicit `shortVersion` and `bundleVersion` expectations and requires `Playground`, `dev.vostride.playground`, `arm64` and `x86_64`. Evidence is retained as `app-info.json`, `app-architectures.txt` and `ios-inspection.json` under `maestro-reports/ios/`. Missing, stale or unresolved metadata fails the release gate before runtime acceptance and attestation. Pure regression fixtures are in `inspect-apk.test.mjs` and `inspect-ios.test.mjs`.

The flow validation command checks both YAML documents, supported command names, selectors, helper references, cycles, fresh-session setup, and the presence of outcome assertions and screenshot capture. It rejects expressions that Maestro 2.11 leaves as literal text, including regex dollar anchors inside JavaScript interpolation. Keep anchors outside expressions (`^${VALUE}$`). An explicit restart helper stops and relaunches both platforms without clearing storage; it is separate from each scenario’s required clean launch.

## Offline evidence

Every Android diagnostic first prepares its disposable GitHub-hosted Linux emulator. `android-emulator.mjs` verifies the target identifies itself as an emulator, then disables only the exact `com.google.android.googlesdksetup` package if installed, verifying the disabled state. This prevents the SDK setup process from covering the app with an ANR while offline. `emulator-preparation.json` records commands and state; preparation failure stops subsequent checks. No Playground or unknown ANR is dismissed, and local/self-hosted targets are rejected before any device command.

The complete Android CI run disables the emulator’s cellular and Wi-Fi networking before launching the app. It requires both the settings and `ConnectivityService`’s `Active default network: none` output, and verifies them again after the suite. `offline-configure.json` and `offline-verify.json` retain the observations; `diagnostic-status.json` fails if either check fails, even when the product journeys pass. The tool only operates on an explicitly named GitHub Actions emulator. It does not change the runner host’s network.

The iOS `all` and focused `offline` scenarios also run an independent XCTest smoke through `ios/offline-run.mjs`. On a disposable GitHub macOS runner, the wrapper prebuilds only the test runner, checks the installed app hash, and coordinates a bounded outbound-network block with a separate recovery process. It requires a fresh app launch, all four product landmarks and actual local WebView text while the block is active, then proves connectivity recovers and the app bundle is unchanged. See [iOS offline harness](ios/README.md) for the exact safeguards and evidence. Require a passing CI run: source validation or an airplane-mode/status-bar override cannot establish offline acceptance.

## Retest a preserved candidate

For a test-harness-only correction, dispatch **Mobile diagnostic acceptance** (`mobile-acceptance.yml`) with the original candidate run ID and `android` or `ios`. Select the ref containing the corrected harness. The workflow downloads only that run's `diagnostic-android-apk-unverified` or `diagnostic-ios-simulator-unverified` artifact from this repository, then runs the selected current harness against the installed binary. When continuous-touch checks are selected, the iOS gesture test runner is compiled independently; the application is not rebuilt.

The `scenario` selector defaults to `all`, which runs the complete Maestro suite, that platform's continuous-touch checks and its offline checks. The iOS-only `offline` scenario runs the separate offline smoke; `drag` includes native URL coverage on iOS. `tasks` runs the Brello flow followed by continuous-touch checks; `drag` runs only continuous-touch checks. `shop`, `flights`, `observability`, and `controls` each run only their corresponding flow from the coverage table below. Scenarios map to fixed paths; arbitrary flow paths are not accepted. The selected scenario is recorded in the run name, summary, and provenance. For `all` and `tasks`, continuous-touch checks still run if Maestro fails, in release verification as well as diagnostics; `diagnostic-status.json` preserves each result, and the diagnostic job fails if any selected check fails. The expanded `all` scenario has a 75-minute Android emulator limit within a 90-minute job, leaving time for setup and evidence uploads. Focused scenarios retain the 35-minute step and 45-minute job limits.

The workflow compares Git file object IDs and modes for `mobile`, all of `packages/core`, `package.json`, and `package-lock.json` between the candidate commit and the selected harness ref. The opposite native project is excluded: iOS retests ignore `mobile/android/`, and Android retests ignore `mobile/ios/`. The exact documentation-only path `mobile/README.md` is also excluded and recorded in provenance; no other file types or documentation paths are ignored. Shared mobile JavaScript, configuration, the selected native project, and dependencies must match exactly; additions, deletions, content edits, and mode changes require a fresh candidate. The build workflow preserves these explicitly unverified binaries immediately after compilation, before runtime checks, so diagnostics can begin while the original checks continue. Failure to preserve this optional diagnostic copy does not skip or weaken any release check. Missing or expired diagnostic artifacts require a fresh candidate; their retention is seven days.

Reports retain the original run, artifact ID, both commits, source comparison, binary SHA-256, screenshots, and test results. These diagnostic runs never attest or publish artifacts and do not replace release verification: the release workflow still builds fresh apps and runs every required gate.

## Coverage

| Scenario                     | Product outcome                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01-shop-checkout.yaml`      | Generated catalog items and refresh; printed sign-in; two mugs subtotal $48/total $53; shipping rejection, opt-in validation defect and recovery; order FW-1001 and cancellation.                                                    |
| `02-flights-booking.yaml`    | Airport/date/traveler controls, filters/sort/date prices; two travelers and $2,426 Flex round trip; fare/occupied-seat defect cycles; invalid forms; booking WL006Q, both-leg seat updates and refund.                               |
| `03-tasks-workflow.yaml`     | Boards and long lists/refresh; create/edit with persisted labels, assignee, due date and checklist; accessible ordering, movement and Undo; filter and move-defect recovery.                                                         |
| `04-vigil-monitor.yaml`      | Time range, paused/live metric behavior, log query/facets/scroll/refresh, trace spans; monitor validation/create/edit/pause/delete; both labelled defect cycles.                                                                     |
| `05-controls-deeplinks.yaml` | Every Home button/tab, visible and hardware Back, native links and local WebView; cart-total failure/recovery; all-product mutations followed by reset and process restart, with eight cleared switches and the fixed log timestamp. |

On iOS, a created task is found through **List → Search tasks → its card**. Closing and reopening that card keeps the same mounted Brello session, preserving undo history and the edited checklist. Komazon's bug is enabled through its named Test controls switch; the separate XCTest verifies the URL query that enables the same flag. The five business scenarios alone are insufficient evidence for an iOS release without the native URL and held-touch tests.

## Deliberately failing sample

`expected-failure/cart-total.yaml` demonstrates the same normal $53 assertion catching the opt-in `cart-total` defect. It first verifies the bug banner, adds two mugs, and observes the defective $29 total. Its final assertion expects $53 and intentionally fails.

```sh
maestro --device "$DEVICE_ID" test tests/mobile/expected-failure/cart-total.yaml
```

That sample is deliberately outside `flows/`; it is not included in the passing release gate. The passing controls scenario separately asserts the bug's effect and session reset. A failure in setup, navigation, or the $29 precondition is not evidence that the final price assertion caught the defect.

Selectors use stable IDs for text fields and ambiguous buttons, and product labels for actions and outcomes. The shared UI derives IDs from labels; custom screens declare their own IDs. Any future change to these released labels, IDs, or seeded references requires a new app path/version rather than changing existing sample expectations.
