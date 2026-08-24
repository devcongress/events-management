import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260824113000_speaker_rejection_email_delivery.sql'),
  'utf8',
);

describe('speaker rejection email delivery migration', () => {
  it('constrains durable decision email state and indexes retry work', () => {
    expect(migration).toContain("decision_email_status in ('pending', 'accepted', 'failed')");
    expect(migration).toContain('speaker_submissions_decision_email_idempotency_idx');
    expect(migration).toContain("where status = 'not_selected' and decision_email_status in ('pending', 'failed')");
  });
});
