# Distribution

## Cloudflare Pages

The repository's web workflow builds static files in `dist/`. Every product owns its output directory; no server framework or Pages Functions are needed.

The live Git-connected Pages project is named `playground`, with [playground-kgs.pages.dev](https://playground-kgs.pages.dev/) and custom domain [playground.vostride.dev](https://playground.vostride.dev/). Cloudflare deployed source `49d24f6`; both hostnames returned HTTPS 200, and all 35 browser checks passed against the custom domain on 2026-10-18. The four web registry contracts are now released with their test-file hashes. Evidence: `test-results/hosted-audit/2026-10-18/`.

Automatic branch previews are verified: branch `verify/pages-8e5602b` deployed source `8e5602b` to [its preview URL](https://verify-pages-8e5602b.playground-kgs.pages.dev/), where all 24 registered released-flow checks passed. The production launcher also passed checks at desktop and phone widths, including all four product links, the agent-qa GitHub destination, lowercase attribution, no horizontal overflow and no external requests. Evidence is in the `branch-preview/` and `launcher/` subdirectories of that hosted audit.

The first hosted audit ran **after** that Git-integrated deployment. The spec's preview-audit-before-production ordering remains an automation requirement. Cloudflare's automatic Git deployments do not wait for the separate GitHub Actions audit. To retain that ordering on the existing Git-connected project, disable automatic production and preview builds in Cloudflare branch controls, then configure the two secrets below so Actions owns the sequence. Cloudflare explicitly supports Wrangler uploads into Git-connected projects. If Cloudflare instead remains the automatic deployer, the ordering requirement must be revised; do not enable a second automatic deployer alongside it.

Setup for the Actions-controlled preview/report/production sequence:

1. Use the existing Git-connected Pages project `playground` with automatic Git builds disabled, or create a **Direct Upload** project for a new installation. Production branch is `main`. If using a different project name, set the repository variable `CLOUDFLARE_PAGES_PROJECT`.
2. Set GitHub Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs Pages edit access to that account. Do not commit these values.
3. Attach `playground.vostride.dev` as a Pages custom domain and complete the Cloudflare DNS setup.
4. Disable bot challenges, Access gates, and challenge rules for this hostname and preview URLs. Automated visitors are the intended users. Noindex is set in each document, `robots.txt`, and `_headers`.
5. Enable Actions for the public repository. Push the verified source to `main`.

The workflow deploys a preview, runs the complete registered sample flows against that preview, and uploads its report. **Site-check failure is advisory and does not block promotion to production.** Compilation failures remain build failures. Branch pushes create previews; main pushes also deploy production. After configuring Cloudflare, the workflow can also be run manually on `main` to perform the same preview, report, and production steps without a source change. Manual runs on other branches create previews only. If Cloudflare credentials have not been configured, the workflow warns and skips publication while retaining the tested build artifact.

Do not configure a second automatic production deployment in Cloudflare Git integration: it would bypass the preview/report ordering implemented by the workflow.

Reference: [Git integration and disabling automatic builds](https://developers.cloudflare.com/pages/configuration/git-integration/), [Pages deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/), [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

## Mobile releases

Native builds are exclusively performed on GitHub runners. Local release tasks reject execution outside GitHub Actions. Local development uses debug builds; local Metro bundling is available for source verification.

Publication also runs exclusively in GitHub Actions. The workflow's final job downloads the artifacts built and tested by its Android and iOS jobs, verifies their checksums, and publishes them to [GitHub Releases](https://github.com/vostride/playground/releases). No locally built or uploaded artifact is used for publication.

**Mobile CI build and release** runs automatically for every push to `main`, with no path filter. It builds the latest commit of that push, runs the [native acceptance journeys](tests/mobile/README.md), checks the merged APK permission list, and publishes only after both platform jobs pass. A multi-commit push releases its latest commit. Concurrency is scoped to the full commit SHA so a newer push cannot cancel another commit's queued build.

The release version is `yy.mm.dd-<7-character commit hash>` using the commit's UTC date, with tag `mobile-<version>`. CI binds that tag to the full source SHA, and refuses a tag collision or partial/draft release. A rerun verifies an already published release and skips rebuilding or replacing it. Android's version name uses the full release label; iOS's marketing version stays numeric (`yy.m.d`). Native build numbers derive from the workflow run number and remain stable across reruns.

Publication normally uses the automatic `GITHUB_TOKEN`. GitHub requires additional workflow permission when an older build's `.github/workflows/` files differ from the current default branch. For that case, the workflow also accepts a `MOBILE_RELEASE_TOKEN` repository secret: a token restricted to this repository with Contents write and Workflows write. It remains a CI-only publication credential. See [GitHub's release authentication requirements](https://docs.github.com/en/rest/releases/releases#create-a-release).

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
