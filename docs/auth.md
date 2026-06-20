# Admin Auth

DevCon-Comm uses Supabase Auth with Google OAuth for hosted organizer access and keeps a local shared-password fallback for development environments without Supabase auth configured.

## Production Flow

1. An owner adds an organizer email in `/organizer-console/organizers`.
2. The email is stored in `public.admin_memberships` with role `owner` or `organizer`.
3. The organizer signs in from `/organizer-console/login`.
4. The organizer chooses Google sign-in from `/organizer-console/login`.
5. Supabase handles the Google OAuth redirect and returns to `/api/auth/admin/callback` with an authorization code.
6. Hono forwards the code to `/organizer-console/auth/callback` on `PUBLIC_APP_URL`, where the browser completes the Supabase PKCE exchange.
7. The browser posts the temporary Supabase access token to `/api/auth/admin/exchange`.
8. Hono verifies the token, checks the verified email against active `admin_memberships`, stores an app-owned row in `admin_sessions`, and sets the `devcon_admin` HTTP-only cookie.
9. The callback route clears the browser Supabase session and redirects into the organizer console.
10. Organizer APIs call `requireAdmin`, which validates the session cookie, active membership, role, and request origin.

The browser Supabase client uses PKCE storage so the code verifier survives the external Google redirect. After the app-owned session cookie is created, the callback signs out of Supabase in the browser. The app cookie contains only an opaque random session token; the hashed token is stored in Supabase.

The login screen stores the intended organizer destination in session storage before starting Google OAuth. If Supabase falls back to the configured Site URL and returns the OAuth code to a public route, the router forwards that code to `/organizer-console/auth/callback` and resumes the organizer sign-in flow.

On Cloudflare, `/api/*` requests can be proxied from Pages to the API Worker. The Worker must still redirect browser-facing OAuth callbacks back to the Pages origin from `PUBLIC_APP_URL` or `PUBLIC_FRONTEND_ORIGIN`; the Worker origin does not serve the Vue organizer routes.

## Roles

| Role | Access |
|---|---|
| `owner` | Full organizer access, can grant owner or organizer access, can disable other owners while keeping at least one active owner, and can review the audit log |
| `organizer` | Organizer console and admin mutations, including adding or disabling other organizers, but cannot grant or revoke owner access |

## Tables

| Table | Purpose |
|---|---|
| `admin_memberships` | Organizer email allowlist, role, status, and last login |
| `admin_sessions` | Hashed app session tokens and expiry metadata |
| `admin_audit_log` | Security-sensitive admin actions with actor, target, request path, IP, user-agent, and compact metadata |

## Audit Log

Owners can review recent admin activity at `/organizer-console/audit-log`. The ledger is backed by `public.admin_audit_log` and records successful organizer mutations such as login/logout, organizer allowlist changes, Luma imports, event and checklist edits, media uploads, feedback status changes, attendance CSV import/removal, speaker access changes, talk review actions, and quiz builder changes.

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
2. Add your app origins to Authorized JavaScript origins, for example `https://devcon-comm.pages.dev` and `http://localhost:5173`.
3. Add the Supabase-hosted callback URI shown on the Google provider page to Authorized redirect URIs.
4. Paste the Google client id and client secret into the Supabase Google provider settings.
5. Keep Supabase Site URL pointed at the deployed app origin so post-auth redirects return to the organizer surface.

Organizer access still depends on `admin_memberships`. A successful Google login does not grant organizer permissions unless the verified email is active in the allowlist.

## Local Fallback

If Supabase admin auth is not configured, `/organizer-console/login` falls back to the local shared password:

```bash
ADMIN_PASSWORD=devcon-admin
ADMIN_SESSION_SECRET=replace-this-locally
```

This fallback is for local development only. Hosted environments should configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` so Google-based organizer auth is used.

## Security Notes

- Admin cookies are `HttpOnly`, path-scoped to `/`, and expire after 12 hours.
- Cookies use `SameSite=Lax` by default. Split-origin deployments that configure `PUBLIC_FRONTEND_ORIGIN` use `SameSite=None; Secure`.
- State-changing admin requests reject unexpected `Origin` headers.
- Organizer management requires `owner` role.
- Audit log review requires `owner` role.
- Disabling a membership blocks future session validation for that email.
- The Supabase service-role key is used only on the server and must never use a `VITE_` prefix.
