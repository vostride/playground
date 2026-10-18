# Native acceptance

Run on the GitHub-built APK and zipped iOS simulator app. TypeScript/Metro checks do not prove native runtime behavior. These checks are required before declaring a mobile release verified.

- Fresh launch: Playground opens without a network connection, permission prompt or sign-in requirement. Product screens open on their functions without promotional or simulation notices; Home retains the requested agent-qa banner and Vostride attribution.
- Navigation: open each of Komazon, Looking, Brello and PepaPog from Home. Switch products with the header app chooser. Exercise each product’s dedicated bottom tabs, back navigation, Android hardware back and the offline WebView guide.
- Deep links: open `playground://shop`, `playground://flights`, `playground://tasks`, `playground://observability`; also open each app's nested routes and an explicit `?bug=<id>` link.
- Komazon: sign in with the printed demo credentials, find Everyday Ceramic Mug, add two, verify $48 subtotal/$53 standard total. Reject incomplete shipping. Complete delivery/review, place order, view orders, cancel. Pull to refresh the catalog, scroll through the long list, operate detail sheets and fields with the keyboard open.
- Looking: choose airports, dates and travelers; search; filter/sort and compare date prices; choose outward/return flights, fare and available seats. Reject occupied seats and invalid traveler/payment data. Confirm, view and cancel a booking; update seats.
- Brello: choose boards, search/filter, create and edit a card, set labels/assignees/due date, complete checklist items. Long-press and drag within and across columns, undo, use the accessible move controls, scroll long lists and refresh. Verify a card deep link opens its details.
- PepaPog: change time range and live state; query logs, apply facets, scroll the long log list and refresh; open log details and its trace, inspect waterfall spans. Validate, create, pause, edit and delete a monitor.
- Bugs: enable each labelled switch individually, confirm the documented failure, disable it and confirm normal behavior. The reset control must clear all app changes and bug switches.
- Restart: force-stop and relaunch. The fixed initial data and baseline simulated timestamps must match a fresh install.

Record device/OS, artifact hash, result and any failure evidence before promoting a mobile entry in the registry. Do not mark these checks complete solely from successful source compilation or JS bundling.

## Native interface redesign

The October 19 native redesign replaces the light interface and global product tabs with local React Native Reusables adaptations, a dark zinc theme, and dedicated product navigation. An earlier redesign candidate compiled and received the limited visual review below. Subsequent source changes add Playground’s P mark, built from the exact supplied Vostride spiral plus a stem, to web/native headers and platform app-icon exports, including Android adaptive and monochrome icons. Komazon now avoids duplicate current-route history entries and retains its originating tab during sign-in. Native TypeScript, all four Vite builds, both Metro bundles with six local assets each, and icon source/render review pass after these changes. The launcher banner passes four web viewport checks with no background external requests. CI for `bd2628e` passes; complete device acceptance remains pending.

The web and native Home launchers now include the requested compact agent-qa banner and “by Vostride” attribution. Both use locally bundled branding and open `https://vostride.com/` only when selected. No network request is required to render the launchers. These additions are included in branding checkpoint `d73e4c4`.

## Current artifact checkpoints

Current main `bd2628e9ad3bc37a6f85bf097ca80f20190b2c4d` passed [web CI 39163941055](https://github.com/vostride/playground/actions/runs/39163941055) and [mobile source CI 39163941069](https://github.com/vostride/playground/actions/runs/39163941069). Pages deployment and the deployed-preview site check were skipped.

[Android-only candidate 39163947889](https://github.com/vostride/playground/actions/runs/39163947889) compiled this source. Artifact `12150355934` has APK SHA-256 `08327267c073e870e7edeb2909dbb190b2b335cb1735b196d329d1dec7c58769`. Independent inspection verifies all 87 application labels and the launcher label as `Playground`, package `dev.vostride.playground`, required `arm64-v8a`/`x86_64` architectures, and no system permissions. The sole app-owned receiver permission remains signature-protected. All five compiled launcher XML variants are unchanged from the inspected `d73e4c4` artwork. Evidence: `test-results/mobile-preview/launcher-name-39163947889/android/launcher-name-audit.json`.

[iOS candidate 39162778135](https://github.com/vostride/playground/actions/runs/39162778135) compiled from `d73e4c4`; its relevant iOS source is identical to `bd2628e`. Artifact `12149204655` has simulator ZIP SHA-256 `af67333a58065f745571b9dc43bfbd760c649f456ed1e2fd31638b25a3531b61`. The six bundled Metro images are byte-identical to source. The compiled 120px launcher icon matches source pixels, and the catalog contains ten renditions through 1024px. Bundle metadata is `Playground`, `dev.vostride.playground`, version `0.1.0` (`1001`). Evidence: `test-results/mobile-preview/redesign-39162778135/ios/packaged-branding-report.json`. It installed and launched on the existing iPhone 18 Pro simulator; `01-current-preview.png` in that evidence directory shows the new mark, banner and footer behind a system Open confirmation, so local route review remains unverified.

At 20:43 UTC on 2026-10-18, Android full journeys and iOS simulator boot/journeys were ongoing. Compilation and packaged-asset checks do not establish a complete acceptance gate, attestation or published release.

The preceding `d73e4c4` Android APK, artifact `12149591603` (SHA-256 `cb05d0f2c5e876c4779a4fa8904c7bbeee1b1a1a78eb1eda14bc6116782a7454`), packaged the correct six brand images and icons but retained the launcher name `Hello App Display Name`. That defect is verified fixed in the new Android APK above; the correction did not change iOS source or its fingerprint.

## Earlier redesign candidate

[Candidate 39160983278](https://github.com/vostride/playground/actions/runs/39160983278) builds source `881c893d17e32602c9db83af4e54573ae1cc35b9`. Android artifact `12149316074` contains `app-release.apk`, independently hashed as `9d5e775017def176ffaebbcf63ee393c0469d610794e1dc7d4034cf6a606481a`. This is a diagnostic candidate artifact, not a published release or an acceptance attestation.

The APK installed successfully and launched on the existing `Pixel_10_Pro` AVD, serial `emulator-5554`. The observed Brello screen has readable dark task cards and Board/List footer controls; a move notification does not obscure the footer. The user then interacted with the app, so further navigation checks were stopped. The OS/API version was not captured and is not inferred from the AVD name. Screenshots and hierarchies are retained in `test-results/mobile-preview/redesign-39160983278/android/`, including `03-user-current.png`. This limited visual check does not establish other product journeys or full acceptance.

This run was intentionally canceled after preserving both compiled previews to allow current-source builds to proceed. Retained Android command reports contain 194 completed/11 skipped commands for Komazon and 288 completed/17 skipped commands for Brello, with no failed command recorded in those reports. There is no final JUnit or post-suite offline/touch result, so no full gate pass is inferred. Four additional screenshots show readable shipping-validation errors, canceled-order details, persisted task properties and checklist controls without overlap. Evidence is `test-results/native-audit/redesign-39160983278/review-summary.json` and its adjacent artifacts.

The preserved iOS simulator ZIP, artifact `12149770822`, has SHA-256 `e50d3c25f382c8e3824f64e56c3206c98942d71f65f845581e4db61bb38f2549`. It launched Home locally; route preview was blocked at the system Open consent, so that preview does not establish route acceptance. Both `881c893` binaries precede the current icon/banner/navigation source and cannot verify `d73e4c4`.

## Historical logo candidate Android evidence

[Candidate 39153739148](https://github.com/vostride/playground/actions/runs/39153739148), commit `a00cc51`, passed the complete Android gate on Android 15/API 35. The downloaded `mobile-android-release` artifact `12147248249` contains `playground-android-0.1.0.apk`; its independently calculated SHA-256 matches the checksum file and [build attestation 57177645](https://github.com/vostride/playground/attestations/57177645): `fa30a7d0980e1c8fe8ecf7c128c3e078761c35d361f4da3808b28079e480406f`. The APK includes both required architectures, `arm64-v8a` and `x86_64`, and requests no system permissions; the sole app-owned AndroidX receiver permission has signature protection `0x2`.

| Passing Maestro journey                                                                                                     | Seconds |
| --------------------------------------------------------------------------------------------------------------------------- | ------: |
| Komazon catalog refresh, exact totals, checkout bug recovery, and cancellation                                              | 278.793 |
| Brello boards, task properties, refresh, move, undo, and both bug switches                                                  | 402.218 |
| Looking search controls, two travelers, bug recovery, checkout, seat changes, cancellation                                  | 589.771 |
| PepaPog range, live metrics, log facets and refresh, span inspection, monitor validation and persistence, both bug controls | 548.723 |
| Home and tab navigation, Back, WebView, deep links, bug recovery, all-product reset and process restart                     | 536.392 |

Both continuous touch checks also passed: within-column reorder followed by Undo, then cross-column movement followed by Undo. Retained hierarchies verify the order and selected status before and after each operation. The offline setup waited for the active default network to disappear before starting the journeys. Its final pre-suite snapshot at 18:26:40.636 UTC and post-drag snapshot at 19:07:03.833 UTC on 2026-10-18 both show airplane mode enabled, Wi-Fi off and no active default network, 40 minutes 23.197 seconds apart. These are before/after observations, not continuous network sampling.

The acceptance report is artifact `12147945112`; inspected evidence, downloaded APK and job log are retained under `test-results/native-audit/android-candidate-39153739148/`. This verifies only the preceding logo/interface candidate. Its iOS gate passed four Maestro journeys, native gestures/URLs and offline launch, but failed PepaPog’s final monitor-save scroll lookup. The button was fully visible; the helper has since stopped forcing centering. Neither platform result verifies the October 19 interface redesign, and the candidate artifact is not a published release.
