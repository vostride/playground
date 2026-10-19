# Distribution

## Cloudflare Pages

The repository's web workflow builds static files in `dist/`. Every product owns its output directory; no server framework or Pages Functions are needed.

Cloudflare's existing Git integration owns deployment. Every push to `main` deploys directly to production; branch pushes can create previews. The owner explicitly chose this behavior instead of a preview-before-merge gate. No Cloudflare account ID, API token, deploy hook, or additional GitHub secret is required.

The live Pages project is `playground`, serving [playground.vostride.dev](https://playground.vostride.dev/) and [playground-kgs.pages.dev](https://playground-kgs.pages.dev/). Its build command is `npm run build`, with output directory `dist/` and repository root as the build root. Keep this Git connection as the only production deployer.

GitHub Actions runs typechecks, product/browser tests and released-contract checks, and retains the static builds. Separate agent-qa journeys report results without gating deployment or mobile publication. To audit an already deployed site, run `PLAYGROUND_URL=https://playground.vostride.dev npm run check:site`; its report is observational and does not control Cloudflare deployment.

The custom domain passed 35 baseline browser checks and eight supplemental checks. Branch `verify/pages-8e5602b` also verified automatic preview deployment and all 24 registered released-flow checks. Evidence is retained under `test-results/hosted-audit/2026-10-18/` and `test-results/hosted-audit/2026-10-19/`. Pages keep noindex/security headers; bot challenges and Access gates must remain off because automated visitors are intended users.

Reference: [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

## Mobile releases

Native builds are exclusively performed on GitHub runners. Local release tasks reject execution outside GitHub Actions. Local development uses debug builds; local Metro bundling is available for source verification.

Publication also runs exclusively in GitHub Actions. The workflow's final job downloads the artifacts built and tested by its Android and iOS jobs, verifies their checksums, and publishes them to [GitHub Releases](https://github.com/vostride/playground/releases). No locally built or uploaded artifact is used for publication.

**Mobile CI build and release** runs automatically for every push to `main`, with no path filter. It builds the latest commit of that push, runs the [native acceptance journeys](tests/mobile/README.md), checks the merged APK permission list, and publishes only after both platform jobs pass. A multi-commit push releases its latest commit. Concurrency is scoped to the full commit SHA so a newer push cannot cancel another commit's queued build.

The release version is `yy.mm.dd-<7-character commit hash>` using the commit's UTC date, with tag `mobile-<version>`. CI binds that tag to the full source SHA, and refuses a tag collision or partial/draft release. A rerun verifies an already published release and skips rebuilding or replacing it. Android's version name uses the full release label; iOS's marketing version stays numeric (`yy.m.d`). Native build numbers derive from the workflow run number and remain stable across reruns.

Publication uses the automatic `GITHUB_TOKEN`, with explicit `contents: write` on the publisher job. No personal access token is required for the current main-commit release, and the owner has chosen to leave `MOBILE_RELEASE_TOKEN` unset. GitHub requires additional workflow permission when an older build's `.github/workflows/` files differ from the current default branch; this caused the historical `fd8e7f9` publisher to fail. That historical publisher is not being retried with a personal token. The optional token override remains supported by the workflow, but is not part of the current setup. See [GitHub's release authentication requirements](https://docs.github.com/en/rest/releases/releases#create-a-release).

Manual dispatch remains available to verify one or both platforms without publication. It uses the same commit-based version and never creates a release. Android builds on Ubuntu and iOS on macOS. iOS uses the **iPhone simulator SDK**, `CODE_SIGNING_ALLOWED=NO`, and produces a zipped `.app`; no IPA or device signing is involved. The build requests both `arm64` and `x86_64` simulator architectures.

The Android APK uses a dedicated playground test certificate shipped in the public template. It is not a production signing identity and carries no trust outside these test fixtures. Release variants omit network permission; debug variants permit a connection to the local Metro server. No runtime permissions are requested. The merged APK retains AndroidX’s app-owned signature receiver permission for API 24–32 compatibility; this internal protection does not prompt the user. Both native workflows use `tests/mobile/inspect-apk.mjs` to require its exact declaration, name and `signature` (`0x2`) protection, reject every other permission request, and require `arm64-v8a` plus `x86_64`. See the [native permission gate](tests/mobile/README.md).

Before device acceptance, the release workflow also compares the compiled binaries with the derived release metadata. Android must have the `dev.vostride.playground` package, `Playground` application labels in every resolved locale and on the launcher, and the exact version name/build number. The iOS inspector reads the processed `Info.plist` inside the compiled `.app`, requiring the same bundle ID/display name, exact numeric marketing/build versions, and both simulator architectures. These checks inspect the same files later installed, packaged and attested. Diagnostic inspection can record older versions without comparing them with a newer workflow run's version; release jobs always supply explicit expectations.

The workflow refuses to overwrite an existing release. Assets are prepared before publication. GitHub's immutable releases setting is enabled for `vostride/playground`, adding a platform-enforced lock after publication. A correction requires a new version and tag; never delete/re-upload an existing binary.

After CI succeeds:

1. Verify the two downloadable binaries with their published SHA-256 checksums.
2. Verify provenance with `gh attestation verify <asset> --repo vostride/playground`.
3. Install the APK and simulator app and run the journeys in [MOBILE-ACCEPTANCE.md](MOBILE-ACCEPTANCE.md).
4. Use the release's `manifest.json` for its full source commit, exact asset filenames, URL and checksums. Record a version in `releases.json` when pinning a mobile sample contract. CI does not commit metadata back to `main`, which would recursively trigger another release. GitHub Releases is the complete build history. This repo does not modify consumer scaffolds.

Reference: [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Stable sample contracts

The release registry includes every existing candidate/released web app and its browser test file. `npm run check:site` walks all entries; adding an app requires adding its flows. `npm run check:releases -- <base-sha>` compares already released entries and rejects changed/deleted contracts. The browser checks then exercise the observable flow against the preview.

Names, titles (`<page> · <name>`), paths, button text and seeded samples used by released flows must not change in place. Keep released tests intact; new paths get new tests. A new app's build must not clear another app's output.
