# Advisory agent-qa journeys

Eight natural-language tests cover Komazon, Looking, Brello, and PepaPog on web and native mobile. They use **agent-qa 0.1.21**, the **OpenAI subscription** provider, and **gpt-6.1-sol**. The same four mobile tests run against Android and iOS through a generated platform config. These are developer dependencies; the shipped apps do not include agent-qa.

## Local dashboard and devices

Run from the repository root with Node 24.15.0:

```sh
npm ci
npm run agent-qa:configure -- web
npx agent-qa dashboard --open
```

The checked-in `agent-qa.config.yaml` is the default dashboard config. It discovers all eight tests and defaults the mobile target to Android. The dashboard listens at <http://localhost:3470>. `agent-qa init` has already been run; do not use `--force` over this project config.

```sh
npx agent-qa devices init
npx agent-qa devices list
```

Device bindings live in ignored `agent-qa.local.yaml`. `devices init` skips an existing file: edit its bindings when switching machines or devices. The application identifier is `dev.vostride.playground` on both platforms. Use a CI-built installed app; native release builds stay in GitHub Actions.

For the iOS tests, generate an iOS config and open that dashboard instead:

```sh
npm run agent-qa:configure -- ios
npx agent-qa --config agent-qa.ci.generated.yaml dashboard --open
```

Close the previous dashboard first, or pass another `--port`. Set `PLAYGROUND_DEVICE_ID` to a simulator UDID or Android serial before generating the platform config to select a specific device. The generated config is ignored by git. Mobile execution also needs an Appium driver compatible with the local OS/Xcode; CI installs its own pinned drivers. Initialization alone does not install drivers or execute a device test.

## Subscription authentication and CI secret

Authenticate the named profile locally:

```sh
npx agent-qa auth login --config playground-codex
node tests/agent-qa/auth.mjs export
gh secret set AGENT_QA_AUTH_JSON --repo vostride/playground \
  < tests/agent-qa/.auth-data/agent-qa/auth.json
```

The export helper reads agent-qa's auth store and writes **only** `playground-codex` into an ignored, mode-0600 file. It never exports other profiles. Alternatively, paste that exported JSON into **GitHub → vostride/playground → Settings → Secrets and variables → Actions → New repository secret**, named `AGENT_QA_AUTH_JSON`. Delete the exported copy after uploading it.

This is agent-qa's OAuth file, **not** `~/.codex/auth.json`. Its normal source is `~/.agent-qa/auth.json`, or `$XDG_DATA_HOME/agent-qa/auth.json` when that variable is set. Do not commit auth files, paste tokens into test YAML, or upload them as artifacts. Model availability depends on the authenticated subscription.

CI writes the selected profile to:

```text
$RUNNER_TEMP/playground-agent-qa-auth/agent-qa/auth.json
```

It sets `XDG_DATA_HOME` to the containing `playground-agent-qa-auth` directory, masks token values, sanitizes reports before upload, and removes the auth directory during cleanup. No OpenAI API key or additional release credential is required for these tests. If authentication expires or a refresh token is rotated/revoked, log in again and replace `AGENT_QA_AUTH_JSON`: refreshes on ephemeral runners do not update the stored GitHub secret. Platform jobs are serial within each advisory run; separate workflow runs may overlap.

## Execution and reports

```sh
# Choose web, android, or ios. Web defaults to the hosted Playground.
npm run agent-qa:configure -- web
npm run agent-qa:validate
npm run agent-qa:test
```

Set `PLAYGROUND_BASE_URL` before configuration to test another web deployment. These tests reset product state and exercise checkout/order cancellation, arbitrary flight dates and booking, task edits/movement, and trace/monitor workflows. Local test execution reports its real exit code.

`.github/workflows/agent-qa.yml` runs separately after the trusted main-push web/mobile build workflows finish. It downloads the exact source run's static build, APK, or simulator app; it does not compile another native app. Release and deployment jobs never depend on this advisory workflow. Missing credentials or missing build artifacts produce explicit skip reasons. Test failures are recorded without blocking publication.

Manual dispatch requires a completed main-push source run ID. Choosing `all` resolves the counterpart web/mobile workflow at the exact same source SHA. Reports, screenshots, source identity, and exit status are retained as `agent-qa-<platform>-<run-id>` artifacts for 14 days. Report sanitization must succeed before upload. Generated local evidence stays under ignored `tests/agent-qa/reports/`.

Validate helper behavior without model calls or device execution:

```sh
node --test tests/agent-qa/auth.test.mjs
```
