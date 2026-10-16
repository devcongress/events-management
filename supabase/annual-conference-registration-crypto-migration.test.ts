import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`./migrations/${file}.sql`, import.meta.url), 'utf8');
const repair = read('20261016150000_conference_registration_crypto_resolution');
const targets = [
  ['20261016100000_annual_conference_free_registration', 'issue_annual_conference_registration_ticket'],
  ['20261012160000_annual_conference_social_card_collections', 'provision_annual_conference_ticket_social_card'],
  ['20261011110000_annual_conference_social_card_delivery', 'issue_annual_conference_social_card_delivery'],
  ['20261016110000_annual_conference_volunteer_check_in', 'check_in_annual_conference_bearer_ticket'],
];

function definition(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2) + 3;

  expect(start).toBeGreaterThanOrEqual(0);

  return sql.slice(start, end);
}

describe('conference registration crypto resolution', () => {
  it.each(targets)('only qualifies crypto calls from %s (%s)', (file, name) => {
    const original = definition(read(file!), name!);
    const corrected = definition(repair, name!);

    expect(corrected).toBe(original.replace(/\b(gen_random_bytes|digest)\(/g, 'extensions.$1('));
    expect(corrected).toContain('set search_path = public');
    expect(corrected).not.toMatch(/(?<!\.)\b(gen_random_bytes|digest)\(/);
  });
});
