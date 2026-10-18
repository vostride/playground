# Native acceptance

Run on the GitHub-built APK and zipped iOS simulator app. TypeScript/Metro checks do not prove native runtime behavior. These checks are required before declaring a mobile release verified.

- Fresh launch: Playground opens without a network connection, permission prompt or sign-in requirement. Screens open on product functions without promotional or simulation notices.
- Navigation: open each of Komazon, Looking, Brello and PepaPog from Home. Exercise bottom tabs, back navigation, Android hardware back and the offline WebView guide.
- Deep links: open `playground://shop`, `playground://flights`, `playground://tasks`, `playground://observability`; also open each app's nested routes and an explicit `?bug=<id>` link.
- Komazon: sign in with the printed demo credentials, find Everyday Ceramic Mug, add two, verify $48 subtotal/$53 standard total. Reject incomplete shipping. Complete delivery/review, place order, view orders, cancel. Pull to refresh the catalog, scroll through the long list, operate detail sheets and fields with the keyboard open.
- Looking: choose airports, dates and travelers; search; filter/sort and compare date prices; choose outward/return flights, fare and available seats. Reject occupied seats and invalid traveler/payment data. Confirm, view and cancel a booking; update seats.
- Brello: choose boards, search/filter, create and edit a card, set labels/assignees/due date, complete checklist items. Long-press and drag within and across columns, undo, use the accessible move controls, scroll long lists and refresh. Verify a card deep link opens its details.
- PepaPog: change time range and live state; query logs, apply facets, scroll the long log list and refresh; open log details and its trace, inspect waterfall spans. Validate, create, pause, edit and delete a monitor.
- Bugs: enable each labelled switch individually, confirm the documented failure, disable it and confirm normal behavior. The reset control must clear all app changes and bug switches.
- Restart: force-stop and relaunch. The fixed initial data and baseline simulated timestamps must match a fresh install.

Record device/OS, artifact hash, result and any failure evidence before promoting a mobile entry in the registry. Do not mark these checks complete solely from successful source compilation or JS bundling.

## Current-logo Android evidence

[Candidate 39153739148](https://github.com/vostride/playground/actions/runs/39153739148), commit `a00cc51`, passed the complete Android gate on Android 15/API 35. The downloaded `mobile-android-release` artifact `12147248249` contains `playground-android-0.1.0.apk`; its independently calculated SHA-256 matches the checksum file and [build attestation 57177645](https://github.com/vostride/playground/attestations/57177645): `fa30a7d0980e1c8fe8ecf7c128c3e078761c35d361f4da3808b28079e480406f`. The APK includes both required architectures, `arm64-v8a` and `x86_64`, and requests no system permissions; the sole app-owned AndroidX receiver permission has signature protection `0x2`.

| Passing Maestro journey | Seconds |
| --- | ---: |
| Komazon catalog refresh, exact totals, checkout bug recovery, and cancellation | 278.793 |
| Brello boards, task properties, refresh, move, undo, and both bug switches | 402.218 |
| Looking search controls, two travelers, bug recovery, checkout, seat changes, cancellation | 589.771 |
| PepaPog range, live metrics, log facets and refresh, span inspection, monitor validation and persistence, both bug controls | 548.723 |
| Home and tab navigation, Back, WebView, deep links, bug recovery, all-product reset and process restart | 536.392 |

Both continuous touch checks also passed: within-column reorder followed by Undo, then cross-column movement followed by Undo. Retained hierarchies verify the order and selected status before and after each operation. The offline setup waited for the active default network to disappear before starting the journeys. Its final pre-suite snapshot at 18:26:40.636 UTC and post-drag snapshot at 19:07:03.833 UTC on 2026-10-18 both show airplane mode enabled, Wi-Fi off and no active default network, 40 minutes 23.197 seconds apart. These are before/after observations, not continuous network sampling.

The acceptance report is artifact `12147945112`; inspected evidence, downloaded APK and job log are retained under `test-results/native-audit/android-candidate-39153739148/`. This verifies the Android candidate with the new logos. iOS acceptance and immutable release publication remain separate requirements; the candidate artifact is not a published release.
