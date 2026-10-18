# Distribution

## Cloudflare Pages

The repository's web workflow builds static files in `dist/`. Every product owns its output directory; no server framework or Pages Functions are needed.

One-time setup:

1. Create a Cloudflare Pages **Direct Upload** project named `playground`, with production branch `main`. If using a different name, set the repository variable `CLOUDFLARE_PAGES_PROJECT`.
2. Set GitHub Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs Pages edit access to that account. Do not commit these values.
3. Attach `playground.vostride.dev` as a Pages custom domain and complete the Cloudflare DNS setup.
4. Disable bot challenges, Access gates, and challenge rules for this hostname and preview URLs. Automated visitors are the intended users. Noindex is set in each document, `robots.txt`, and `_headers`.
5. Enable Actions for the public repository. Push the verified source to `main`.

The workflow deploys a preview, runs the complete registered sample flows against that preview, and uploads its report. **Site-check failure is advisory and does not block promotion to production.** Compilation failures remain build failures. Branch pushes create previews; main pushes also deploy production. After configuring Cloudflare, the workflow can also be run manually on `main` to perform the same preview, report, and production steps without a source change. Manual runs on other branches create previews only. If Cloudflare credentials have not been configured, the workflow warns and skips publication while retaining the tested build artifact.

Do not configure a second automatic production deployment in Cloudflare Git integration: it would bypass the preview/report ordering implemented by the workflow.

Reference: [Pages deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/), [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

## Mobile releases

Native builds are exclusively performed on GitHub runners. Local release tasks reject execution outside GitHub Actions. Local development uses debug builds; local Metro bundling is available for source verification.

Run **Mobile candidate checks and immutable release** manually with a semantic version to verify a candidate first. It builds both platforms, runs the [native acceptance journeys](tests/mobile/README.md), checks the merged APK permission list, and uploads checksummed, attested artifacts without publishing a release.

A new `mobile-vX.Y.Z` tag runs the same checks and publishes only after both platforms pass. Android builds on Ubuntu and iOS on macOS. iOS uses the **iPhone simulator SDK**, `CODE_SIGNING_ALLOWED=NO`, and produces a zipped `.app`; no IPA or device signing is involved. The build requests both `arm64` and `x86_64` simulator architectures.

The Android APK uses a dedicated playground test certificate shipped in the public template. It is not a production signing identity and carries no trust outside these test fixtures. Release variants omit network permission; debug variants permit a connection to the local Metro server. No runtime permissions are requested. The merged APK retains AndroidX’s app-owned signature receiver permission for API 24–32 compatibility; this internal protection does not prompt the user. Both native workflows use `tests/mobile/inspect-apk.mjs` to require its exact declaration, name and `signature` (`0x2`) protection, reject every other permission request, and require `arm64-v8a` plus `x86_64`. See the [native permission gate](tests/mobile/README.md).

The workflow refuses to overwrite an existing release. Assets are prepared before publication. GitHub's immutable releases setting is enabled for `vostride/playground`, adding a platform-enforced lock after publication. A correction requires a new version and tag; never delete/re-upload an existing binary.

After CI succeeds:

1. Verify the two downloadable binaries with their published SHA-256 checksums.
2. Verify provenance with `gh attestation verify <asset> --repo vostride/playground`.
3. Install the APK and simulator app and run the journeys in [MOBILE-ACCEPTANCE.md](MOBILE-ACCEPTANCE.md).
4. Append the exact release URL, asset filenames, tag, and checksums to `releases.json`. Consumers pin that release and both hashes. This repo does not modify consumer scaffolds.

Reference: [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Stable sample contracts

The release registry includes every existing candidate/released web app and its browser test file. `npm run check:site` walks all entries; adding an app requires adding its flows. `npm run check:releases -- <base-sha>` compares already released entries and rejects changed/deleted contracts. The browser checks then exercise the observable flow against the preview.

Names, titles (`<page> · <name>`), paths, button text and seeded samples used by released flows must not change in place. Keep released tests intact; new paths get new tests. A new app's build must not clear another app's output.
