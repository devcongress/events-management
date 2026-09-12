# Weekly Project Night

Owners and organizers can enable, pause or skip a week from Project Night event details, including mobile. One series is supported; other event types and volunteers cannot configure it. Installing the migration does not enable recurrence.

## Schedule and content

- Thursday occurrences keep the original source event’s time and duration in Africa/Accra. Enable requires a Thursday source in that timezone.
- Enable/resume waits for the next Monday 09:00 window; it does not announce immediately. Repeated enable preserves an already enabled cursor.
- The existing 15-minute Worker scheduler prepares the next occurrence as a draft. On or after Monday 09:00, before Thursday’s start, only that week is published. Missed past weeks are bypassed without a published backlog.
- Slack uses the existing website-ready gate and per-event delivery claim. Recorded sent announcements are not resent. Website delays retry automatically; failed Slack delivery retains the existing manual retry workflow.
- Pause stops automatic advancement, not already published posts. Skip advances one week and leaves that draft unpublished by recurrence. Removed/archived occurrences are not republished; removing the source stops advancement.
- Each occurrence is a separate event. Attendance, registrations, schedules, speakers and galleries are not copied. Name, description, venue and links are copied from the original source. Review drafts if these contain week-specific information; existing drafts retain their saved details.
- The initial image comes from the most recently sent Project Night event’s cover, falling back to the source. Changing the source or a linked occurrence cover updates the default and unskipped future drafts. Other published occurrences keep their images. Normal editing can still update the particular Slack post being edited.
- Existing same-Thursday Project Night events are adopted instead of duplicated.

## Release and architecture

Apply `supabase/migrations/20260912020000_project_night_recurrence.sql` before deploying the Worker/UI. Tables are RLS-protected and service-role-only. Configuration and advancement share a transaction-level advisory lock; occurrence dates are unique. Automatic publication is audited in the database transaction; organizer controls use the app audit boundary.

The internal advance route requires the existing `SLACK_EVENTS_RETRY_SECRET`. No new environment variables, cron expressions or Codex automations are needed. After deployment, explicitly select **Enable recurrence** on Project Night and confirm the displayed date and source details.

## Verification

API tests cover roles, invalid actions/events/days, auditing and scheduler authorization. The fixture browser journey covers enable, skip and pause at phone and desktop widths, without live requests.

`scripts/test-project-night-recurrence.mjs` installs the actual migration with relevant canonical event constraints in an isolated PostgreSQL database. Only afterwards it substitutes a synthetic clock for scheduling tests. It checks draft/publication timing, repeated calls, image propagation, pause/resume, skip, missed weeks, audit records and grants.

Initialize a disposable PostgreSQL cluster under `mktemp -d /tmp/project-night-postgres.XXXXXX`, with its Unix socket in that directory and TCP disabled. Create an empty database named `project_night_test`. Run `PGHOST=<temporary directory> PGPORT=<test port> PGDATABASE=project_night_test node scripts/test-project-night-recurrence.mjs`, then stop the cluster. The runner rejects other host paths/database names. Never use production.
