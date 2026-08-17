import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Scenario Atlas production isolation', () => {
  it('is absent from the EMS production entrypoints', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');
    const productionServer = readFileSync('server/index.ts', 'utf8');
    const appEntry = readFileSync('src/main.ts', 'utf8');
    expect(viteConfig).not.toContain('scenario-atlas');
    expect(productionServer).not.toContain('scenario-atlas');
    expect(appEntry).not.toContain('scenario-atlas');
  });

  it('keeps mutable Atlas state ignored', () => {
    expect(readFileSync('.gitignore', 'utf8')).toContain('/.scenario-atlas/');
  });
});
