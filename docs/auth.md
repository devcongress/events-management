# Organizer and Volunteer Auth

DevCon-Comm uses Supabase Auth with Google OAuth for organizer and annual-conference volunteer access in every environment. Local and hosted runs share the same membership allowlist and app-owned session flow; incomplete configuration fails closed.

## Production Flow

1. An owner adds an organizer email in `/organizer-console/organizers`.
2. The email is stored in `public.admin_memberships` with role `owner`, `organizer`, or `volunteer`.
3. The organizer signs in from `/organizer-console/login`.
4. The organizer chooses Google sign-in from `/organizer-console/login`.
5. Supabase handles the Google OAuth redirect and returns to `/api/auth/admin/callback` with an authorization code.
6. Hono forwards the code to `/organizer-console/auth/callback` on `PUBLIC_APP_URL`, where the browser completes the Supabase PKCE exchange.
7. The browser posts the temporary Supabase access token to `/api/auth/admin/exchange`.
8. Hono verifies the token, checks the verified email against active `admin_memberships`, stores an app-owned row in `admin_sessions`, and sets an HTTP-only session cookie (`__Host-devcon_admin` on secure deployments).
9. The callback route clears the browser Supabase session and redirects into the organizer console.
10. Organizer APIs call `requireAdmin`, which validates the session cookie, active membership, role, and request origin.

The browser Supabase client uses tab-scoped `sessionStorage` for PKCE storage so the code verifier survives the external Google redirect without being shared across multiple organizer tabs. After the app-owned session cookie is created, the callback signs out of Supabase in the browser. The app cookie contains only an opaque random session token; the hashed token is stored in Supabase.

The login screen stores the intended organizer destination in session storage before starting Google OAuth. If Supabase falls back to the configured Site URL and returns the OAuth code to a public route, the router forwards that code to `/organizer-console/auth/callback` and resumes the organizer sign-in flow.

The login route, protected-route session gate, and OAuth callback all render the same Programme Cover authentication surface. Only the access panel changes: it reports session checking, Google handoff, callback verification, bounded access denial, or retry states without replacing the page. Unapproved accounts receive a generic denial and a fresh Google account-selection action; provider and server error details are never rendered from query parameters. The router accepts only same-origin internal destination paths, and organizer content remains unmounted until the server confirms an active membership.

On Cloudflare, `/api/*` requests can be proxied from Pages to the API Worker. The Worker must still redirect browser-facing OAuth callbacks back to the configured public origin from `PUBLIC_APP_URL` or `PUBLIC_FRONTEND_ORIGIN`; in production this is `https://em.devcongress.org`, while the Worker origin does not serve the Vue organizer routes.

## Sign out

Sign out revokes the app-owned session and removes its HTTP-only cookie. Secure deployments expire `__Host-devcon_admin` with the required `Secure` and `Path=/` attributes, then also clear the legacy/local `devcon_admin` cookie. The browser then clears its cached organizer session and any pending OAuth redirect before replacing the current route with `/organizer-console/login`. It also attempts to clear the tab-scoped Supabase session, but that cleanup is best-effort and cannot block a confirmed app sign-out. If the server cannot confirm sign-out, the console stays open and shows an error rather than navigating away with an uncertain session state.

## Roles

| Role | Access |
|---|---|
| `owner` | Full organizer access, can grant owner, organizer, or volunteer access, can disable other owners while keeping at least one active owner, can re-enable or permanently remove disabled memberships, and can review the audit log |
| `organizer` | Organizer console and admin mutations, including adding or disabling organizers and volunteers, but cannot grant or revoke owner access |
| `volunteer` | Annual Conference overview plus tasks where the volunteer is the accountable owner or a collaborator; may update only those task statuses unless an Owner grants additional responsibilities for that edition |

Volunteer sessions are redirected to the active Annual Conference. With no additional grants, UI routing and server API policy deny Events, Attendance, Feedback, organizer management, audit logs, volunteer-applicant records, task creation, and task ownership/detail changes. Assigned-task responses remove organizer-only internal notes.

Owners manage additive, edition-scoped Annual Conference responsibilities for active Volunteers from **People & Access → Delegation**. The code-owned catalogue separates full work-plan viewing, work-plan management, timeline viewing, phase management, volunteer-team viewing, intake sharing, and application review. Applicant review is the only volunteer-section responsibility that exposes applicant email addresses and social handles. Organizers and Owners cannot receive delegation grants because their access is governed by role. Changing or disabling a membership clears its explicit conference grants before its sessions are revoked.

Disabled memberships remain visible to Owners with two explicit choices: re-enable the existing membership or permanently remove it after confirmation. Permanent removal is limited to already-disabled memberships, deletes their app sessions and conference grants through database cascades, and retains historical audit records and task attribution.

## Tables

| Table | Purpose |
|---|---|
| `admin_memberships` | Organizer email allowlist, role, status, and last login |
| `admin_sessions` | Hashed app session tokens and expiry metadata |
| `admin_audit_log` | Security-sensitive admin actions with actor, target, request path, IP, user-agent, and compact metadata |
| `annual_conference_access_grants` | Additive member capabilities scoped to one Annual Conference edition, with granting-owner provenance |

## Audit Log

Owners can review recent admin activity at `/organizer-console/audit-log`. The ledger is backed by `public.admin_audit_log` and records successful organizer mutations such as login/logout, organizer allowlist changes, native event and registration changes, check-ins, checklist edits, media uploads, feedback status changes, historical attendance CSV import/removal, speaker access changes, talk review actions, and quiz builder changes.

Audit metadata should stay small and non-sensitive. Store identifiers, counts, statuses, and changed field names rather than raw CSV contents, feedback text, OAuth provider tokens, or full request bodies.

## Bootstrap

Before the first hosted login, insert the first owner manually with the Supabase SQL editor:

```sql
insert into public.admin_memberships (email, display_name, role)
values ('you@example.com', 'Your Name', 'owner')
on conflict (email) do update set
  display_name = excluded.display_name,
  role = 'owner',
  status = 'active';
```

After that owner signs in, they can add more organizer emails from the console.

## Google Provider Setup

Configure Google in Supabase Dashboard → Authentication → Sign In / Providers and Google Cloud Console before the first hosted organizer sign-in.

Required setup:

1. In Google Cloud, create a Web OAuth client.
2. Add your app origins to Authorized JavaScript origins: `https://em.devcongress.org` for production and `http://localhost:5173` for local development.
3. Add the Supabase-hosted callback URI shown on the Google provider page to Authorized redirect URIs.
4. Paste the Google client id and client secret into the Supabase Google provider settings.
5. Keep Supabase Site URL pointed at the deployed app origin so post-auth redirects return to the organizer surface.

Organizer access still depends on `admin_memberships`. A successful Google login does not grant organizer permissions unless the verified email is active in the allowlist.

Only owners can change an existing member between the Organizer and Volunteer roles. The People & Access directory exposes this as an inline role selector only to owners, the API repeats the owner check, and a successful role change revokes the member's existing app sessions so the narrower or broader access takes effect on their next sign-in.

For local development, keep Google OAuth pinned to `http://localhost:5173`. The login screen blocks Google sign-in on other local ports or `127.0.0.1` so Supabase does not fall back to the deployed Site URL.

## Local Development

Local organizer access uses the same Supabase Google OAuth and membership allowlist as hosted access. Configure `APP_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

There is no shared-password fallback. When Supabase organizer auth is incomplete, `/api/auth/session` reports `auth_configured: false` and the login screen presents a configuration error instead of downgrading to a local owner account.

## Security Notes

- Admin cookies are `HttpOnly`, path-scoped to `/`, and have a 12-hour absolute lifetime. Hosted cookies are also `Secure` and use the `__Host-` prefix.
- Organizer sessions also expire after 30 minutes without authenticated activity. The organizer workspace gives a two-minute pause warning, revalidates when the tab regains focus, and clears cached organizer data when it locks; the server remains authoritative.
- Cookies always use `SameSite=Lax`. The supported hosted design proxies `/api/*` through the Pages origin; direct cross-origin cookie authentication is intentionally unsupported.
- State-changing admin requests require an `Origin` header and reject origins outside the configured app/frontend allowlist.
- Organizer management requires `owner` role.
- Audit log review requires `owner` role.
- Every authenticated request joins the current membership role/status instead of trusting the login-time snapshot.
- Changing a membership role or status revokes its active sessions in both the application command and a database trigger.
- Annual Conference grants are resolved from the database for each protected request, so removing a responsibility does not depend on a cached browser role.
- OAuth failure states are mapped from allowlisted status categories rather than displaying provider or server response bodies, and external, protocol-relative, or backslash-based redirect targets are rejected.
- The Supabase service-role key is used only on the server and must never use a `VITE_` prefix.
