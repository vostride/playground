import { spawnSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
for (const app of ['shop', 'flights', 'observability', 'tasks']) {
  const result = spawnSync('npm', ['run', 'build', '--workspace', `@playground/${app}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status) process.exit(result.status);
}
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
