# Supabase Backup Runbook

The Free Supabase plan does not provide downloadable platform-managed backups. This repository therefore includes a backup command that captures the project database and Storage objects into one encrypted archive. Local runs keep that archive outside the repository. The scheduled production path uploads the encrypted archive to a private Cloudflare R2 bucket.

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

The archive uses `tar` and gzip for packaging and `age` for encryption. Do not replace it with an ordinary ZIP file and do not commit an archive to Git. Git keeps historical binary objects, creates repository bloat, and shares the same compromise boundary as the source code.

## Scheduled private R2 backups

`.github/workflows/supabase-backup.yml` runs every day at 02:17 UTC and supports manual dispatch. It:

1. installs the pinned Supabase CLI and `age`;
2. validates the complete backup configuration and Docker runtime;
3. initializes an absolute temporary directory through GitHub's runtime environment file, then creates the database and Storage archive there;
4. uploads only the encrypted `.tar.gz.age` file through R2's S3-compatible API;
5. verifies the remote object size and SHA-256 metadata;
6. removes expired encrypted objects according to the retention policy.

Create one private R2 bucket dedicated to backups. Do not enable `r2.dev`, a custom public domain, or public access. Create an R2 S3 token with **Object Read & Write** permission scoped only to that bucket. Add these GitHub Actions repository secrets:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Percent-encoded Supabase Session Pooler URL |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only project service-role key |
| `SUPABASE_BACKUP_AGE_RECIPIENT` | Public `age` recipient; never the private identity |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `R2_BACKUP_BUCKET` | Dedicated private bucket name |
| `R2_BACKUP_ACCESS_KEY_ID` | Bucket-scoped R2 S3 access key ID |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Bucket-scoped R2 S3 secret access key |

The encryption identity stays offline and outside GitHub, Cloudflare, the repository, and the workstation backup directory. Losing that identity makes every archive unrecoverable, so keep at least two protected copies.

The uploader stores archives under:

```text
events-management/supabase/YYYY/MM/events-management-supabase-<timestamp>.tar.gz.age
```

Retention preserves the newest archive from each of the latest seven UTC days, four ISO weeks, and twelve UTC months. A rerun with identical content is idempotent. If an object exists at the same key with different content, the upload fails rather than overwriting it. Objects whose names do not match the backup format are never deleted.

After configuring the secrets, manually dispatch **Supabase backup** once. Verify the workflow log reports `R2 upload verified`, then inspect the private bucket and record the first successful run before relying on the schedule.

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

Once configured, R2 provides the off-workstation encrypted copy. Test a restore quarterly and record row counts, Storage object counts, manifest verification, authentication behavior, and application smoke-test results. A successful upload is not proof that the archive can be decrypted or restored.
