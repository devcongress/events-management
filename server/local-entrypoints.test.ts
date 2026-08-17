import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts?: Record<string, string> };

describe('local package entry points', () => {
  it('advertises the organizer-capable Supabase app on one strict port', () => {
    expect(packageJson.scripts?.dev).toBe(
      'APP_DATA_SOURCE=supabase vite --host 0.0.0.0 --port 5173 --strictPort',
    );
  });

  it('advertises the separate local Scenario Atlas port', () => {
    expect(packageJson.scripts?.atlas).toBe(
      'SCENARIO_ATLAS_PORT=4178 bun run tools/scenario-atlas/server.ts',
    );
  });

  it('keeps the production Bun entry point separate', () => {
    expect(packageJson.scripts?.start).toBe('bun run server/index.ts');
  });
});
