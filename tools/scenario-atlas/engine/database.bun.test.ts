import { describe, expect, it } from 'bun:test';

import { AtlasDatabase } from './database';

describe('Scenario Atlas local database', () => {
  it('persists, updates, and resets local scenario state', () => {
    const database = new AtlasDatabase(':memory:');
    database.write('MOD-17', 'failed', 'Observed a conflicting decision.');
    expect(database.readAll()['MOD-17']).toMatchObject({
      status: 'failed',
      note: 'Observed a conflicting decision.',
    });
    database.write('MOD-17', 'verified', 'Fixed and retested.');
    expect(database.readAll()['MOD-17']).toMatchObject({ status: 'verified', note: 'Fixed and retested.' });
    database.reset();
    expect(database.readAll()).toEqual({});
    database.close();
  });
});
