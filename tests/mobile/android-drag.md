# Android held-finger drag acceptance

After installing the release APK on the CI emulator, run from the repository root:

```sh
node tests/mobile/android-drag.mjs emulator-5554
```

This helper resets the app session and opens Brello. It reads task accessibility IDs and bounds from UIAutomator XML, performs a continuous held-finger drag with Android's `input touchscreen draganddrop`, and checks the rendered result:

1. Move `CKB-001` below `CKB-002` in Backlog; check their vertical order and undo it.
2. Move `CKB-001` into the adjacent To do column; open its details, check the selected status, undo it, and check Backlog is selected again.

It does not call app functions, edit app state, or substitute status-button taps for dragging. Coordinates come from visible accessibility bounds, including clipping of the partially visible adjacent column. Scroll gestures inside task details only reveal the undo and status controls.

The helper temporarily sets the emulator's long-press timeout to 800 ms and restores its previous setting in `finally`. Brello's own 400 ms activation threshold remains unchanged. The 2000 ms drag duration includes the initial hold; a short default duration can finish before any movement is emitted. This follows [Android 15 InputShellCommand](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/services/core/java/com/android/server/input/InputShellCommand.java#L465) and [ViewConfiguration](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/core/java/android/view/ViewConfiguration.java#L649). Successful runtime evidence is still required to establish gesture behavior on the emulator.

All assertions must pass. Failure exits nonzero and writes diagnostics; no interaction is optional. XML snapshots, screenshots, command timings, and `result.json` are saved under `maestro-reports/android/drag/`, which the release workflow retains even on failure. The helper never compiles or installs an app and requires only Node and `adb` on PATH. Its parser and geometry checks can run without an emulator:

```sh
node --test tests/mobile/android-drag.test.mjs
```

Maestro 2.11.0's ordinary swipe is unsuitable for a shared Android/iOS long-press test: its [iOS event helper](https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-ios-xctest-runner/maestro-driver-iosUITests/Routes/XCTest/EventRecord.swift#L27) reaches the endpoint at 100 ms and holds there for the remaining requested duration. It does not provide an initial 400 ms stationary hold. The iOS acceptance test therefore uses XCTest's continuous press-and-drag gesture separately.
