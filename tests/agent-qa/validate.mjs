import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import {
  discoverWorkspaceFiles,
  formatDiagnostics,
  resolveWorkspacePaths,
  validateProject,
} from '@vostride/agent-qa-core';

const root = fileURLToPath(new URL('../../', import.meta.url));

// The published v0.1.21 validate command ignores the global --config option.
// Use the same published validator with an explicit generated configuration.
export async function validateGeneratedConfig(configFile = 'agent-qa.ci.generated.yaml') {
  const configPath = resolve(root, configFile);
  const config = YAML.parse(await readFile(configPath, 'utf8'));
  const workspace = resolveWorkspacePaths({ config, configPath, requireExistingFiles: true });
  const [tests, result] = await Promise.all([
    discoverWorkspaceFiles({ workspace, kind: 'test' }),
    validateProject({ configPath, workspace }),
  ]);
  if (tests.length === 0) {
    result.diagnostics.push({
      file: configPath,
      line: 1,
      column: 1,
      severity: 'error',
      message: 'The generated configuration discovered no tests. Check workspace.testMatch.',
    });
    result.errorCount++;
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await validateGeneratedConfig();
    process.stdout.write(formatDiagnostics(result));
    process.exitCode = result.errorCount > 0 ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
