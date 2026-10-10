import { createHash } from 'node:crypto';
import { z } from 'zod';

const identifier = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
const schemaName = z.enum(['public', 'storage']);
const filename = z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const definition = z.array(z.string().min(1).max(500)).min(1);
const object = { schema: schemaName, name: identifier };
const relation = { ...object, table: identifier };

export const probeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('table'), ...object, rls: z.boolean(), private: z.boolean() }).strict(),
  z.object({ kind: z.literal('column'), ...relation, type: z.string().min(1), notNull: z.boolean(), defaultExpression: z.string().nullable() }).strict(),
  z.object({ kind: z.literal('index'), ...relation, contains: definition }).strict(),
  z.object({ kind: z.literal('constraint'), ...relation, contains: definition }).strict(),
  z.object({
    kind: z.literal('function'), ...object,
    argumentTypes: z.string().regex(/^[a-z0-9_,\[\] ]*$/),
    result: z.string().min(1),
    language: z.enum(['sql', 'plpgsql']),
    bodySha256: digest,
    securityDefiner: z.boolean(),
    searchPath: z.string().min(1),
    private: z.boolean(),
    serviceExecute: z.boolean(),
  }).strict(),
  z.object({ kind: z.literal('trigger'), ...relation, function: identifier, functionSchema: schemaName, contains: definition }).strict(),
]);

export const contractSchema = z.object({
  version: z.literal(1),
  legacyInventory: z.record(filename, digest),
  verified: z.array(z.object({ file: filename, sha256: digest, checks: z.array(probeSchema).min(1) }).strict()).min(1),
}).strict();

export type MigrationContract = z.infer<typeof contractSchema>;
export type Probe = z.infer<typeof probeSchema>;
export type MigrationSource = { file: string; sql: string };

const legacyDuplicatePairs = [
  ['20260616000000_admin_auth.sql', '20260616000000_luma_event_imports.sql'],
  ['20260808150000_archive_materials_follow_up.sql', '20260808150000_integrity_hardening.sql'],
];

// Frozen inventory, not an assertion that historical migrations were applied.
// New files cannot silently enter the unverified legacy exemption.
const LEGACY_INVENTORY_DIGEST = '307e8e1a52e007f62aa05e7d86c01548b1b761c8f7fcbed0baf8bc01d9098e29';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function functionDigest(body: string): string {
  return sha256(body.replace(/\r\n/g, '\n').trim());
}

export function validateInventory(contract: MigrationContract, sources: MigrationSource[]): string[] {
  const problems: string[] = [];
  const entries = new Map(Object.entries(contract.legacyInventory));
  const files = new Set(sources.map((source) => source.file));
  const versions = new Map<string, string[]>();

  const legacyDigest = sha256(JSON.stringify(Object.entries(contract.legacyInventory).sort(([a], [b]) => a.localeCompare(b))));

  if (legacyDigest !== LEGACY_INVENTORY_DIGEST) problems.push('Legacy baseline changed. Add forward migrations with reviewed checks, not new legacy exemptions.');

  for (const entry of contract.verified) {
    if (entries.has(entry.file)) problems.push(`${entry.file}: duplicate contract entry.`);

    entries.set(entry.file, entry.sha256);
  }

  for (const source of sources) {
    const registeredHash = entries.get(source.file);

    if (!registeredHash) problems.push(`${source.file}: add reviewed verification checks to the contract.`);
    else if (registeredHash !== sha256(source.sql)) problems.push(`${source.file}: SQL changed without a matching reviewed contract.`);

    const version = source.file.slice(0, 14);

    versions.set(version, [...(versions.get(version) ?? []), source.file]);
  }

  for (const file of entries.keys()) {
    if (!files.has(file)) problems.push(`${file}: contract references a missing migration.`);
  }

  for (const grouped of versions.values()) {
    if (grouped.length < 2) continue;

    const sorted = [...grouped].sort();
    const approved = legacyDuplicatePairs.some((pair) => JSON.stringify([...pair].sort()) === JSON.stringify(sorted));

    if (!approved) problems.push(`${sorted.join(', ')}: duplicate migration version.`);
  }

  return problems;
}
