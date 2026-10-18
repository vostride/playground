# Corkboard held-touch acceptance

This standalone XCTest UI target exercises the **already installed** `dev.vostride.playground` simulator app. It has no app target dependency, CocoaPods, package dependencies, or reference to the main native project. CI builds only its unsigned test runner in Debug; the app under test remains the release candidate already installed by the workflow.

The two tests use `XCUICoordinate.press(forDuration: 0.8, thenDragTo:)`, preserving one held contact from pickup to drop. They assert actual UI outcomes:

- Drag CKB-002 above CKB-001 in Backlog, observe the card order reverse, then undo and observe the original order.
- Drag CKB-001 into the visible part of To do, verify its horizontal position and selected status in details, then undo and verify Backlog returns.

Coordinates come from stable `task-card-*` element bounds. The cross-column drop stays outside the board's 40-point horizontal edge-scroll band. These tests deliberately cover ordinary reorder and cross-column drag; edge auto-scroll remains a separate gesture scenario. Status buttons are only read as assertions, never used to perform a move.

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

The project is checked in directly and needs no generator. `plutil -lint CorkboardGestures.xcodeproj/project.pbxproj` validates its plist structure. Source validation alone is not runtime proof; the workflow must execute both tests before publishing artifacts. No native release build is run locally.

References: [Apple's installed-app selection](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/init(bundleidentifier:)), [held-coordinate drag API](https://developer.apple.com/documentation/xcuiautomation/xcuicoordinate/press(forduration:thendragto:)).
