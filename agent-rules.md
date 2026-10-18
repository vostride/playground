# Playground test execution

Use the visible product interface for every action and assertion. Verify the exact
outcome in each step; do not infer success from a click, a toast, or the absence of
an error. Report an unmet expectation as a test failure.

Test only the configured Playground web targets or the installed Playground mobile
app. Keep external branding links unopened unless a test explicitly asks for them.
Use the synthetic account and checkout values supplied in the test steps.

Reset product state at the start of each test. Enable a labelled deliberate bug
only when the test asks for it, and turn it off before resuming the normal flow.
Do not change application source, test expectations, credentials, or CI settings.
