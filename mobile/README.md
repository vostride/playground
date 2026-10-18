# Playground mobile

A bare React Native 0.83.1 application with four bundled products: Komazon, Looking, Brello, and PepaPog. The native projects are based on the MIT-licensed [official React Native Community Template](https://github.com/react-native-community/template/tree/0.83-stable); its license is retained in `TEMPLATE-LICENSE`. There is no Expo runtime.

## Development

Install dependencies at the repository root with `npm ci` using Node 24.15 or later. For Android, use JDK 17, Android SDK 36, build tools 36.0.0, and NDK 27.1.12297006. For iOS, use Xcode with an iOS simulator and install CocoaPods dependencies with `bundle install` in this directory followed by `bundle exec pod install` in `ios`.

```sh
npm start -w @playground/mobile
npm run android -w @playground/mobile
npm run ios -w @playground/mobile
```

These commands launch debug builds. Release builds run only in GitHub Actions: Gradle and Xcode require `GITHUB_ACTIONS=true` and reject local release builds. The public debug signing key signs the installable playground APK; it is a test fixture, not a production identity.

Shared data and business logic are imported from `@playground/core`. Metro watches the workspace and stores generated caches under this app. State lasts for the app session; Test controls → Reset playground session restores every seeded product.

## Validation without native release builds

```sh
npm run typecheck -w @playground/mobile
npm run bundle:android -w @playground/mobile
npm run bundle:ios -w @playground/mobile
```

Bundles are written to the ignored `.bundle/` directory. Native release artifacts, simulator launch validation, checksums, and attestations are produced by the repository's mobile release workflow.

## Deep links and controls

The application ID and iOS bundle ID are `dev.vostride.playground`. The registered URL scheme is `playground`.

- `playground://shop` opens Komazon. `playground://shop/cart` opens the cart.
- `playground://flights` opens Looking. `playground://flights/bookings` opens My trips.
- `playground://tasks` opens Brello.
- `playground://observability` opens PepaPog; `/logs`, `/traces`, and `/monitors` select their views.

Append `?bug=<id>` to opt into an individually labelled bug. The same IDs are available through Test controls, and an active bug is always shown in the app banner. With no bug enabled, all normal flows use their passing behavior.

Android releases request no Android/system permissions and show no permission prompts. The merged manifest retains only the app-owned signature permission `dev.vostride.playground.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; AndroidX uses it to protect non-exported dynamic receivers on API 24–32. Both release and diagnostic CI verify its exact name and signature protection level (`0x2`) and reject every other permission request. Only debug builds declare Internet access for Metro. The iOS target has no permission prompt descriptions. All product data, illustrations, and the local WebView guide are bundled; the guide rejects external navigation and disables JavaScript.
