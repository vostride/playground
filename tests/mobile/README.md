# Native acceptance flows

These Maestro flows exercise the installed bare React Native app on both Android and iOS. They operate through rendered controls, accessibility labels, test IDs, real keyboard input, sheets, deep links, and a native WebView. They do not invoke product functions or inject application state.

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

The workflow pins Maestro 2.11.0 and verifies the downloaded archive checksum. Each flow launches a fresh session with every runtime permission denied. The app requests no release permissions.

For local source validation only:

```sh
npm run test:mobile:flows
```

This checks both YAML documents, supported command names, selectors, helper references, cycles, fresh-session setup, and the presence of outcome assertions and screenshot capture.

## Retest a preserved candidate

For a test-harness-only correction, dispatch **Mobile diagnostic acceptance** (`mobile-acceptance.yml`) with the original candidate run ID and `android` or `ios`. Select the ref containing the corrected harness. The workflow downloads only that run's `diagnostic-android-apk-unverified` or `diagnostic-ios-simulator-unverified` artifact from this repository, then runs the current Maestro suite and continuous-touch checks against the installed binary. The iOS gesture test runner is compiled independently; the application is not rebuilt.

The workflow requires identical Git trees for `apps/mobile`, `packages/core`, `package.json`, and `package-lock.json` between the candidate commit and the selected harness ref. App or dependency changes require a fresh candidate. Missing or expired diagnostic artifacts also require a fresh candidate; their retention is seven days.

Reports retain the original run, artifact ID, both commits, source comparison, binary SHA-256, screenshots, and test results. These diagnostic runs never attest or publish artifacts and do not replace release verification: the release workflow still builds fresh apps and runs every required gate.

## Coverage

| Scenario                     | Product outcome                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-shop-checkout.yaml`      | Two $24 mugs total $53 with standard shipping; sign-in; invalid address rejected; order FW-1001 created and cancelled.                            |
| `02-flights-booking.yaml`    | A round trip selected; occupied seats disabled; seats on both legs; empty traveler rejected; sample payment; booking WL006Q confirmed and listed. |
| `03-tasks-workflow.yaml`     | Task created and edited; moved to In progress; undo restores To do; checklist completion persists after reopening.                                |
| `04-vigil-monitor.yaml`      | Service/status query returns matching event; event opens a trace waterfall; monitor saves its threshold; pause and deletion update state.         |
| `05-controls-deeplinks.yaml` | Warm links open each flow; bundled WebView loads; labelled quantity bug produces $29; reset clears its flag and cart.                             |

## Deliberately failing sample

`expected-failure/cart-total.yaml` demonstrates the same normal $53 assertion catching the opt-in `cart-total` defect. It first verifies the bug banner, adds two mugs, and observes the defective $29 total. Its final assertion expects $53 and intentionally fails.

```sh
maestro --device "$DEVICE_ID" test tests/mobile/expected-failure/cart-total.yaml
```

That sample is deliberately outside `flows/`; it is not included in the passing release gate. The passing controls scenario separately asserts the bug's effect and session reset. A failure in setup, navigation, or the $29 precondition is not evidence that the final price assertion caught the defect.

Selectors use stable IDs for text fields and ambiguous buttons, and product labels for actions and outcomes. The shared UI derives IDs from labels; custom screens declare their own IDs. Any future change to these released labels, IDs, or seeded references requires a new app path/version rather than changing existing sample expectations.
