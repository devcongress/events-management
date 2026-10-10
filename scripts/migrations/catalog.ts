import { execFileSync } from 'node:child_process';
import { z } from 'zod';

import { functionDigest, type MigrationContract, type Probe } from './contract';
import { MigrationGateError } from './errors';

// Fixed catalog-only SQL. Never interpolate contract data or execute migration SQL.
export const CATALOG_SQL = `
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL idle_in_transaction_session_timeout = '20s';
SELECT json_build_object(
  'readOnly', current_setting('transaction_read_only'),
  'historyPresent', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'objects', COALESCE((
    SELECT json_agg(item) FROM (
      SELECT json_build_object('kind', 'table', 'schema', n.nspname, 'name', c.relname,
        'rls', c.relrowsecurity, 'private', NOT (
          has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
          has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
          has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') OR
          has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        )) AS item
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT json_build_object('kind', 'column', 'schema', n.nspname, 'table', c.relname, 'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull,
        'defaultExpression', pg_get_expr(d.adbin, d.adrelid))
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname IN ('public', 'storage') AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT json_build_object('kind', 'index', 'schema', n.nspname, 'table', c.relname, 'name', idx.relname,
        'definition', pg_get_indexdef(i.indexrelid), 'valid', i.indisvalid AND i.indisready)
      FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'storage')
      UNION ALL
      SELECT json_build_object('kind', 'constraint', 'schema', n.nspname, 'table', c.relname, 'name', k.conname,
        'definition', pg_get_constraintdef(k.oid), 'valid', k.convalidated)
      FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'storage')
      UNION ALL
      SELECT json_build_object('kind', 'function', 'schema', n.nspname, 'name', p.proname,
        'argumentTypes', oidvectortypes(p.proargtypes), 'body', p.prosrc, 'securityDefiner', p.prosecdef,
        'result', pg_get_function_result(p.oid), 'language', l.lanname,
        'searchPath', (SELECT substring(setting FROM 13) FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'),
        'private', NOT (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')),
        'serviceExecute', has_function_privilege('service_role', p.oid, 'EXECUTE'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.prokind = 'f'
      UNION ALL
      SELECT json_build_object('kind', 'trigger', 'schema', n.nspname, 'table', c.relname, 'name', t.tgname,
        'function', p.proname, 'functionSchema', fn.nspname,
        'definition', pg_get_triggerdef(t.oid), 'valid', t.tgenabled IN ('O', 'A'))
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace fn ON fn.oid = p.pronamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ) catalog
  ), '[]'::json)
);
ROLLBACK;
`;

const catalogObjectSchema = z.object({
  kind: z.string(), schema: z.string(), name: z.string(), table: z.string().optional(),
  type: z.string().optional(), notNull: z.boolean().optional(), rls: z.boolean().optional(),
  defaultExpression: z.string().nullable().optional(),
  private: z.boolean().optional(), valid: z.boolean().optional(), definition: z.string().optional(),
  argumentTypes: z.string().optional(), body: z.string().optional(), securityDefiner: z.boolean().optional(),
  result: z.string().optional(), language: z.string().optional(), functionSchema: z.string().optional(),
  searchPath: z.string().nullable().optional(), serviceExecute: z.boolean().optional(), function: z.string().optional(),
});

export const catalogSchema = z.object({
  readOnly: z.literal('on'), historyPresent: z.boolean(), objects: z.array(catalogObjectSchema),
});

export type Catalog = z.infer<typeof catalogSchema>;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function probePasses(probe: Probe, catalog: Catalog): boolean {
  return catalog.objects.some((object) => {
    if (object.kind !== probe.kind || object.schema !== probe.schema || object.name !== probe.name) return false;
    if ('table' in probe && object.table !== probe.table) return false;

    switch (probe.kind) {
      case 'table': return object.rls === probe.rls && object.private === probe.private;
      case 'column': return object.type === probe.type && object.notNull === probe.notNull
        && object.defaultExpression === probe.defaultExpression;
      case 'index':
      case 'constraint': return object.valid === true && probe.contains.every((part) => normalize(object.definition ?? '').includes(normalize(part)));
      case 'trigger': return object.valid === true && object.function === probe.function
        && object.functionSchema === probe.functionSchema
        && probe.contains.every((part) => normalize(object.definition ?? '').includes(normalize(part)));
      case 'function': return object.argumentTypes === probe.argumentTypes && object.body !== undefined
        && object.result === probe.result && object.language === probe.language
        && functionDigest(object.body) === probe.bodySha256 && object.securityDefiner === probe.securityDefiner
        && object.searchPath === probe.searchPath && object.private === probe.private && object.serviceExecute === probe.serviceExecute;
    }
  });
}

export function evaluateCatalog(contract: MigrationContract, catalog: Catalog) {
  return contract.verified.map((migration) => {
    const missing = migration.checks.filter((probe) => !probePasses(probe, catalog));

    return {
      file: migration.file,
      status: missing.length === 0 ? 'verified' : missing.length === migration.checks.length ? 'missing-or-drifted' : 'partial-or-drifted',
      missing: missing.map((probe) => `${probe.kind}: ${probe.schema}.${'table' in probe ? `${probe.table}.` : ''}${probe.name}`),
    };
  });
}

export function databaseEnvironment(databaseValue: string, apiValue: string): NodeJS.ProcessEnv {
  let database: URL;
  let api: URL;

  try {
    database = new URL(databaseValue);
    api = new URL(apiValue);
  } catch {
    throw new MigrationGateError('Invalid database/API configuration; URLs are not printed.');
  }

  const project = api.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
  const directProject = database.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  const pooledProject = decodeURIComponent(database.username).match(/^[a-z_][a-z0-9_]*\.([a-z0-9]+)$/i)?.[1];
  const isPooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/i.test(database.hostname);

  if (api.protocol !== 'https:' || !['postgres:', 'postgresql:'].includes(database.protocol)
    || !project || project !== (directProject ?? (isPooler ? pooledProject : undefined))
    || !database.username || !database.password || database.pathname !== '/postgres' || database.search || database.hash) {
    throw new MigrationGateError('Database/API must identify the same Supabase project and an encrypted PostgreSQL connection.');
  }

  return {
    PATH: process.env.PATH,
    PGHOST: database.hostname, PGPORT: database.port || '5432', PGDATABASE: 'postgres',
    PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password),
    PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '10',
  };
}

export function readCatalog(environment: NodeJS.ProcessEnv): Catalog {
  let output: string;

  try {
    output = execFileSync('psql', ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1'], {
      input: CATALOG_SQL, env: environment, encoding: 'utf8', timeout: 25000,
      maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Driver errors can contain connection details. Do not forward them to logs.
    throw new MigrationGateError('Catalog verification failed. Check psql, database credentials, permissions, and network access; no migration was executed.');
  }

  try {
    return catalogSchema.parse(JSON.parse(output.trim()));
  } catch {
    throw new MigrationGateError('Catalog response is invalid or the transaction was not read-only.');
  }
}
