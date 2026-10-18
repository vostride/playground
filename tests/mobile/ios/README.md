# Native iOS URL and held-touch acceptance

This standalone XCTest UI target exercises the **already installed** `dev.vostride.playground` simulator app. It has no app target dependency, CocoaPods, package dependencies, or reference to the main native project. CI builds only its unsigned test runner in Debug; the app under test remains the release candidate already installed by the workflow.

The scheme runs three tests. Two use `XCUICoordinate.press(forDuration: 0.8, thenDragTo:)`, preserving one held contact from pickup to drop. They assert actual UI outcomes:

- Drag CKB-002 above CKB-001 in Backlog, observe the card order reverse, then undo and observe the original order.
- Drag CKB-001 into the visible part of To do, verify its horizontal position and selected status in details, then undo and verify Backlog returns.

Coordinates come from stable `task-card-*` element bounds. The cross-column drop stays outside the board's 40-point horizontal edge-scroll band. These tests deliberately cover ordinary reorder and cross-column drag; edge auto-scroll remains a separate gesture scenario. Status buttons are only read as assertions, never used to perform a move.

`NativeLinkTests.testNativeURLsReachEveryProductAndPreserveWarmBugState` is the mandatory URL companion to the iOS Maestro business flows, which navigate through visible app controls. It makes 13 visits through Apple's direct-target `XCUIApplication.open` API to verify home, flights/search and bookings, the bare `playground://observability` overview plus logs and monitors, Brello board and seeded task detail, the bare `playground://shop` catalog, its `?bug=cart-total` variant, and cart. It leaves and returns to Komazon without a bug query and requires the label to remain, proving warm-session query state. This verifies the candidate's native URL delivery and rendering without injecting app state; it does not exercise SpringBoard's first-consent scheme chooser.

Every test terminates and relaunches the app to restore its seeded, in-memory session. Tests run serially on the same booted simulator and retain screenshots and accessibility hierarchies in the `.xcresult` bundle. They do not inject application state or call shared product logic.

Run on a GitHub macOS runner with Xcode 16.4, an already booted iPhone 16 / iOS 18.5 simulator, and the candidate installed:

```sh
xcodebuild test \
  -project tests/mobile/ios/CorkboardGestures.xcodeproj \
  -scheme CorkboardGestures \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$PLAYGROUND_SIMULATOR_ID" \
  -parallel-testing-enabled NO \
  -maximum-concurrent-test-simulator-destinations 1 \
  -derivedDataPath maestro-reports/ios/gesture-build \
  -resultBundlePath maestro-reports/ios/corkboard-gestures.xcresult \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO
```

The explicit simulator ID and disabled parallel testing prevent a fresh simulator clone without the installed app. The scheme has no target application; `XCUIApplication(bundleIdentifier:)` selects the installed candidate. A missing app, failed pickup, unchanged order/status, or ineffective undo fails the test.

The project is checked in directly and needs no generator. `plutil -lint CorkboardGestures.xcodeproj/project.pbxproj` validates its plist structure. Source validation alone is not runtime proof; the workflow must execute all three tests and the five Maestro business scenarios before publishing iOS artifacts. No native release build is run locally.

References: [Apple's installed-app selection](<https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/init(bundleidentifier:)>), [held-coordinate drag API](<https://developer.apple.com/documentation/xcuiautomation/xcuicoordinate/press(forduration:thendragto:)>).

## Bounded offline launch smoke — separate CI-only target

`offline-launch.xcodeproj` / `OfflineLaunch` contains one separate test. It is intentionally absent from the normal three-test `CorkboardGestures` scheme and fails without its independent host harness. Run only on a disposable GitHub macOS runner, with the release candidate already installed on an explicitly selected, booted simulator:

```sh
node tests/mobile/ios/offline-run.mjs "$PLAYGROUND_SIMULATOR_ID"
```

The wrapper refuses other operating systems, non-GitHub environments, and aliases such as `booted`. It builds only the independent unsigned test runner online, then uses `test-without-building`. The installed `dev.vostride.playground` bundle is hashed before and after, never rebuilt, patched, re-signed, or given injected state. The local-network ATS policy, an HTTP exception for `127.0.0.1`, and the control URL are configured exclusively in the independent test runner. Apple explicitly supports literal IPv4/IPv6 exception keys starting with iOS 17, so this policy applies to the iOS 18.5 test host; no arbitrary-load exception is enabled.

The test runner starts online and calls the host harness over `127.0.0.1` before terminating and fresh-launching the candidate. This keeps Xcode startup outside the outage. The smoke checks the rendered Komazon catalog/product, Looking search/departure picker, Brello seeded board/task, PepaPog request metric, and actual HTML text inside the local Help WebView. It records screenshots and an accessibility hierarchy in its own `.xcresult`. It does not dismiss permission prompts or enable app test flags.

The offline test does not explicitly terminate the candidate during teardown. In diagnostic `39152516414`, every UI check and the completion marker passed within 30.001 seconds of cutoff, but teardown stalled at `app.terminate()` until the 40-second recovery deadline. The run correctly failed because XCTest had not exited and the final blocked-network probes had not run. Candidate cleanup is left to the workflow's simulator shutdown after the wrapper restores networking. Startup termination and fresh launch, all assertions, XCTest exit validation, probes, and recovery deadlines remain unchanged. The correction passed in [diagnostic `39153689069`](https://github.com/vostride/playground/actions/runs/39153689069), harness `70430e1`, on preserved candidate `39148891517` / application source `2985e92`: one XCTest passed in 29.994 seconds, the journey marker arrived 28.861 seconds after cutoff, final blocked-network probes finished at 32.576 seconds, and owned-rule/token cleanup finished at 32.675 seconds. External IPv4 recovered to HTTP 200, the watchdog did not fire, and the installed app hash was unchanged. No external IPv6 baseline was reachable; the both-family PF rule was verified without claiming an IPv6 connectivity transition. This result verifies that prior candidate, not the subsequent logo revision or a published release.

Only the separate `OfflineLaunch` test action disables Debug Executable. Diagnostic run `39149516667` installed the runner but stalled at a launch request containing `wait_for_debugger=1`, before any test output or outage request. Debugger involvement is an inference under test, not a confirmed cause. This bounded launch experiment changes no candidate settings, startup deadlines, outage limits, or assertions. The original and prepared `.xctestrun` files and patched test-host `Info.plist` are retained outside the excluded build directory for comparison.

Recovery is targeted at 40 seconds, and acceptance rejects any measured outage reaching 45 seconds. This is an acceptance ceiling, not an absolute OS recovery guarantee: if `pfctl` fails, independent restoration retries continue and the test fails. One launchd-owned root watchdog owns **all** PF mutation, including its enable reference. Before loading rules, it verifies the existing sole `com.apple/*` filter hook and that its unique direct child sorts before every other child. The exact stock `scrub-anchor "com.apple/*" all fragment reassemble` prefix is also permitted: it normalizes packets before filtering and cannot bypass the filter hook. Other main rules, duplicate hooks, altered normalization options, or reversed order are rejected. The rules permit loopback without state and silently block all outbound traffic on every other interface, with no IPv4/IPv6 restriction. Existing PF states are flushed once because established states bypass newly loaded rules. This temporarily interrupts the disposable runner's own external connections too; the main ruleset and other anchors are never replaced or flushed.

The watchdog is ready before any block can be requested. It serializes activation and recovery, caches the monotonic deadline, and survives cancellation or death of the wrapper/XCTest process. Recovery removes only the owned anchor's rules and releases only the owned PF token. If cleanup fails, the daemon keeps retrying; it is never unloaded while restoration is unverified. No workflow `always()` step is relied on to restore networking.

The owned anchor is `com.apple/000.pg-offline-<full UUID>`: 61 ASCII bytes, with its entire UUID retained. Construction, activation, watchdog startup, and cleanup validate this exact namespace and reject names reaching 64 bytes before invoking PF. Apple's [Darwin PF header](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/net/pfvar.h#L629) defines `PF_ANCHOR_NAME_SIZE` as 64; the [upstream PF loader](https://github.com/freebsd/freebsd-src/blob/stable/10/sbin/pfctl/pfctl.c#L1398) copies the full anchor argument into that name buffer and reports `pfctl_add_rule: strlcpy` on overflow. Read-only inspection of the installed Darwin `pfctl` confirms the same full-argument 64-byte copy. Diagnostic `39151276952` reached XCTest's outage request but rejected the former 69-byte name with that error; cleanup succeeded, but no offline pass was established. The shorter prefix preserves the first-child ordering check, rules, probes, and recovery deadlines. Diagnostic `39152516414` verified activation, the initial blocked-network probes, and watchdog restoration with the shorter name, but failed during XCTest teardown as described above. Diagnostic `39153689069` subsequently completed the full bounded offline gate on the preserved candidate; later application revisions still require fresh verification.

Pass evidence requires successful external IPv4 HTTPS before cutoff; failed fixed-address IPv4 and IPv6 probes plus working loopback during the block; successful XCTest completion before recovery; the same failed external probes again **after XCTest exits and before restoration**; an unchanged candidate hash; verified cleanup; and successful external HTTPS afterward. DNS and proxy settings cannot explain the failed probes because they use fixed addresses and bypass proxies. If the runner has no working external IPv6 baseline, evidence says so explicitly: the both-family PF rule is verified, but an unavailable IPv6 route is not presented as an observed online-to-offline transition. A previously working IPv6 route must recover afterward too.

A watchdog firing, daemon failure or missing final status, any deadline expiry, or a successful test that finishes after recovery is always failure. Completion within 40 seconds is not guaranteed on a slow runner; the limit is never extended automatically. Evidence is written under `maestro-reports/ios/offline/<run-UUID>/` (`evidence.json`, probe results, activation/cleanup records, build/test logs, and `offline.xcresult`); `offline/latest.json` contains a copy of the latest result. Exclude only `offline/*/build/**` when uploading artifacts.

Local verification must not execute the wrapper with forged CI flags or build the native target. Pure safety tests and Swift source typechecking are safe:

```sh
node --test tests/mobile/ios/offline-*.test.mjs
plutil -lint tests/mobile/ios/offline-launch.xcodeproj/project.pbxproj
```

The safety tests cover inert/bypassable anchors, both-family rule enforcement, cancellation during an in-flight rule load, owned-only cleanup, deadlines, and false positives after watchdog recovery. Source checks do not establish runtime offline acceptance. The GitHub diagnostic must demonstrate both outage enforcement and runner recovery before this can be treated as acceptance evidence. The retained runner 2.337.0 retries network requests, but its reconnection behavior is not a guaranteed outage SLA; see the [runner retry code](https://github.com/actions/runner/blob/v2.337.0/src/Runner.Common/RunnerService.cs) and [renewal implementation](https://github.com/actions/runner/blob/v2.337.0/src/Runner.Listener/JobDispatcher.cs).

Implementation references: Apple `pf.conf(5)` (anchor order, `quick`, state bypass) and `pfctl(8)` (`-E` / `-X`, named-anchor operations) shipped with macOS; `xcodebuild.xctestrun(5)` (test-host environment); [Apple's local networking ATS policy](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking) and [literal-IP exceptions on iOS 17+](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsexceptiondomains).
