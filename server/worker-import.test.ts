import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Cloudflare Worker entry point', () => {
  it('loads outside Vite without evaluating browser-only environment configuration', () => {
    const workerUrl = new URL('./worker.ts', import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--eval', `import(${JSON.stringify(workerUrl)})`],
      { encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
