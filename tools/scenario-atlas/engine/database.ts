import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { StoredStatus } from '../catalog/schema';
import type { ScenarioStateMap } from './status';

type StateRow = { scenario_id: string; status: StoredStatus; note: string; updated_at: string };

export class AtlasDatabase {
  private readonly database: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path, { create: true, strict: true });
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS scenario_state (
        scenario_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('untested', 'verified', 'failed')),
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `);
  }

  readAll(): ScenarioStateMap {
    const rows = this.database.query<StateRow, []>(
      'SELECT scenario_id, status, note, updated_at FROM scenario_state ORDER BY scenario_id',
    ).all();
    return Object.fromEntries(rows.map((row) => [row.scenario_id, {
      status: row.status,
      note: row.note,
      updatedAt: row.updated_at,
    }]));
  }

  write(scenarioId: string, status: StoredStatus, note: string): void {
    this.database.query(`
      INSERT INTO scenario_state (scenario_id, status, note, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(scenario_id) DO UPDATE SET
        status = excluded.status,
        note = excluded.note,
        updated_at = excluded.updated_at
    `).run(scenarioId, status, note, new Date().toISOString());
  }

  reset(): void {
    this.database.exec('DELETE FROM scenario_state');
  }

  close(): void {
    this.database.close();
  }
}
