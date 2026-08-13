import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('./migrations/20260813010000_security_audit_privilege_hardening.sql', import.meta.url),
  'utf8',
);

describe('security audit privilege hardening migration', () => {
  it('revokes the audited overload and future default public execution', () => {
    expect(migration).toMatch(
      /revoke execute on function public\.record_annual_conference_income_receipt\(\s*uuid,\s*bigint,\s*date,\s*text,\s*text,\s*text,\s*uuid\s*\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(/alter default privileges for role postgres in schema public\s+revoke execute on functions from public/i);
  });

  it('keeps the idempotent finance receipt RPC available to the service role', () => {
    expect(migration).toMatch(
      /grant execute on function public\.record_annual_conference_income_receipt\(\s*uuid,\s*bigint,\s*date,\s*text,\s*text,\s*text,\s*uuid\s*\) to service_role/i,
    );
  });
});
