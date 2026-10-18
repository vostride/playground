import assert from 'node:assert/strict';
import { readFile, writeFile, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import YAML from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const platform = process.argv[2];
assert.ok(['web', 'android', 'ios'].includes(platform), 'Choose web, android, or ios.');
const config = YAML.parse(await readFile(resolve(root, 'agent-qa.config.yaml'), 'utf8'));
config.workspace.testMatch = [`tests/agent-qa/${platform === 'web' ? 'web' : 'mobile'}/*.yaml`];
// CI receives a clean, platform-specific config; the local dashboard config stays intact.
if (platform === 'web') {
  const base = new URL(process.env.PLAYGROUND_BASE_URL || 'https://playground.vostride.dev/');
  assert.ok(['http:', 'https:'].includes(base.protocol), 'Use an HTTP(S) web target.');
  assert.ok(!base.username && !base.password, 'Do not put credentials in the target URL.');
  config.registry.targets = Object.fromEntries(
    ['shop', 'flights', 'tasks', 'observability'].map((app) => [
      `web-${app}`,
      { platform: 'web', url: new URL(`/${app}/`, base).href },
    ]),
  );
  config.registry.devices = {};
} else {
  config.registry.targets = {
    'playground-mobile':
      platform === 'android'
        ? { platform, appPackage: 'dev.vostride.playground', appActivity: '.MainActivity' }
        : { platform, bundleId: 'dev.vostride.playground' },
  };
  const id = process.env.PLAYGROUND_DEVICE_ID;
  if (id) assert.match(id, /^[A-Za-z0-9_.:-]+$/, 'Invalid device identifier.');
  config.registry.devices = {
    'playground-ci': {
      platform,
      transport: 'local',
      match: id ? { [platform === 'android' ? 'serial' : 'udid']: id } : {},
    },
  };
}
for (const filename of [config.workspace.envFile, config.workspace.secretsFile]) {
  // Create missing empty files required by v0.1.21; never replace local values.
  const handle = await open(resolve(root, filename), 'a', 0o600);
  await handle.close();
}
await writeFile(resolve(root, 'agent-qa.ci.generated.yaml'), YAML.stringify(config));
console.log(`Prepared ${platform} tests with agent-qa 0.1.21 / gpt-6.1-sol.`);
