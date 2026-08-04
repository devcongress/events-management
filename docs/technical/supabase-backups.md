# Supabase Backup Runbook

The Free Supabase plan does not provide downloadable platform-managed backups. This repository therefore includes a local backup command that captures the project database and Storage objects into one encrypted archive.

## Backup contents

Every successful archive contains:

- database roles;
- database schema;
- database table data, including the application and managed data included by Supabase's dump workflow;
- `supabase_migrations` schema and migration history when present, or an explicit marker recording that the source database has no CLI migration-history schema;
- every object downloaded from `meetup-media` or the configured bucket list;
- a manifest containing file sizes, SHA-256 hashes, the source Git commit, Supabase CLI version, and Storage object counts.

Database components and Storage objects are downloaded sequentially. The result is a logical operational backup, not a single transactionally consistent snapshot across PostgreSQL and Storage.

## One-time preparation

Install and start:

- Supabase CLI;
- Docker Desktop or OrbStack;
- `age` encryption tooling.

Create a dedicated encryption identity outside the repository:

```bash
mkdir -p /secure/private/directory
age-keygen -o /secure/private/directory/events-management-backup-key.txt
chmod 600 /secure/private/directory/events-management-backup-key.txt
```

Copy `.env.backup.example` to `.env.backup.local`, then run `chmod 600 .env.backup.local`. Configure:

- `SUPABASE_DB_URL` with the **Session Pooler** connection string from Supabase Dashboard → Connect. It must contain the database password, with special characters percent-encoded.
- `SUPABASE_BACKUP_DIR` with an absolute directory outside the Git repository.
- `SUPABASE_BACKUP_AGE_RECIPIENT` with the public recipient printed by `age-keygen`.
- `SUPABASE_BACKUP_BUCKETS` when additional Storage buckets are introduced.

The existing `.env.local` supplies `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never commit either local environment file, a database URL, an encryption identity, or a backup archive.

## Run a backup

Validate configuration and dependencies without reading project data:

```bash
pnpm backup:supabase:check
```

Create the encrypted backup:

```bash
pnpm backup:supabase
```

The command fails unless all database and Storage components complete. Plaintext staging data is removed after success and cleaned up after failure. The final filename resembles:

```text
events-management-supabase-20260804T150000Z.tar.gz.age
```

## Inspect or restore an archive

Decrypt into a private temporary location:

```bash
age --decrypt \
  --identity /secure/private/directory/events-management-backup-key.txt \
  --output events-management-supabase.tar.gz \
  events-management-supabase-20260804T150000Z.tar.gz.age

mkdir restored-backup
tar -xzf events-management-supabase.tar.gz -C restored-backup
```

Before using the backup, compare every unpacked file with `manifest.json`. Restore database dumps only into a disposable Supabase project or isolated PostgreSQL database first. Supabase's supported restore order is roles, schema, then data with `session_replication_role = replica`; restore migration history when the destination must preserve CLI migration state. Copy Storage objects only after the database restore is validated.

Never test a restore against production. Auth sessions may also become invalid when the destination project uses a different JWT secret.

## Retention and recovery checks

Recommended starting retention:

- nightly archives for 7 days;
- weekly archives for 4 weeks;
- monthly archives for 6 to 12 months;
- an immediate archive before every production migration.

Keep at least one encrypted copy off the workstation. Test a restore quarterly and record row counts, Storage object counts, manifest verification, authentication behavior, and application smoke-test results.
