import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import YAML from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const platform = process.argv[2];
assert.ok(['web', 'android', 'ios'].includes(platform), 'Choose web, android, or ios.');
const config = YAML.parse(await readFile(resolve(root, 'agent-qa.config.yaml'), 'utf8'));
const allTargets = config.registry.targets;
config.registry.targets = Object.fromEntries(
  Object.entries(allTargets).filter(([, target]) => target.platform === platform),
);
// Run each journey once. The iOS suites are for the interactive dashboard;
// CI uses single-test execution so every journey appears in the same JUnit report.
config.workspace.suiteMatch = ['.agent-qa/generated-tests/suites/*.suite.yaml'];
// CI receives a clean, platform-specific config; the local dashboard config stays intact.
if (platform === 'web') {
  config.workspace.testMatch = ['tests/agent-qa/web/*.yaml'];
  const base = new URL(process.env.PLAYGROUND_BASE_URL || 'https://playground.vostride.dev/');
  assert.ok(['http:', 'https:'].includes(base.protocol), 'Use an HTTP(S) web target.');
  assert.ok(!base.username && !base.password, 'Do not put credentials in the target URL.');
  for (const target of Object.values(config.registry.targets)) {
    target.url = new URL(new URL(target.url).pathname, base).href;
  }
  config.registry.devices = {};
} else {
  const relativeDirectory = `.agent-qa/generated-tests/${platform}`;
  const directory = resolve(root, relativeDirectory);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const sourceDirectory = resolve(root, 'tests/agent-qa/mobile');
  for (const filename of (await readdir(sourceDirectory))
    .filter((name) => name.endsWith('.yaml'))
    .sort()) {
    const test = YAML.parse(await readFile(resolve(sourceDirectory, filename), 'utf8'));
    const product = allTargets[test.target]?.product;
    const targetName = `${platform}-${product}`;
    assert.ok(
      product && config.registry.targets[targetName],
      `Missing ${platform} target for ${filename}.`,
    );
    test.target = targetName;
    test.use = { ...test.use, device: 'playground-ci' };
    await writeFile(resolve(directory, filename), YAML.stringify(test));
  }
  config.workspace.testMatch = [`${relativeDirectory}/*.yaml`];
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
