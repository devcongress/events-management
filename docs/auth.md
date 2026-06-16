# Admin Auth

DevCon-Comm uses Supabase Auth for hosted organizer access and keeps a local shared-password fallback for development environments without Supabase auth configured.

## Production Flow

1. An owner adds an organizer email in `/organizer-console/organizers`.
2. The email is stored in `public.admin_memberships` with role `owner` or `organizer`.
3. The organizer signs in from `/organizer-console/login`.
4. The server checks the email against active `admin_memberships`, then asks Supabase Auth to send an email OTP magic link.
5. Supabase redirects back to `/organizer-console/login` with its verified sign-in fragment.
6. The login page immediately posts the access token to `/api/auth/admin/exchange`, then clears the fragment from the URL.
7. Hono verifies the token with Supabase, checks the membership again, stores an app-owned row in `admin_sessions`, and sets the `devcon_admin` HTTP-only cookie.
8. Organizer APIs call `requireAdmin`, which validates the session cookie, active membership, role, and request origin.

The browser does not persist Supabase access or refresh tokens. The app cookie contains only an opaque random session token; the hashed token is stored in Supabase.

## Roles

| Role | Access |
|---|---|
| `owner` | Full organizer access plus organizer email management |
| `organizer` | Organizer console and admin mutations, excluding organizer email management |

## Tables

| Table | Purpose |
|---|---|
| `admin_memberships` | Organizer email allowlist, role, status, and last login |
| `admin_sessions` | Hashed app session tokens and expiry metadata |
| `admin_audit_log` | Security-sensitive admin actions such as login, organizer add/update, and organizer disable |

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

## Email Templates

Supabase sends the first-time organizer email through the `Confirm sign up` template and later sign-ins through the `Magic Link` template. Use the branded templates in `supabase/templates/` so organizer emails look like DevCongress instead of the Supabase default.

| Supabase template | Subject | Repo template |
|---|---|---|
| Confirm sign up | `Confirm your DevCongress organizer access` | `supabase/templates/admin-confirmation.html` |
| Magic Link | `Your DevCongress organizer sign-in link` | `supabase/templates/admin-magic-link.html` |

Paste the HTML into Supabase Dashboard → Authentication → Email Templates. The templates use `{{ .ConfirmationURL }}` for the secure sign-in link and `{{ .SiteURL }}/brand/dev-con-logo.png` for the logo, so keep the Supabase Site URL pointed at the deployed app origin.

## Local Fallback

If Supabase admin auth is not configured, `/organizer-console/login` falls back to the local shared password:

```bash
ADMIN_PASSWORD=devcon-admin
ADMIN_SESSION_SECRET=replace-this-locally
```

This fallback is for local development only. Hosted environments should configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` so email-based admin auth is used.

## Security Notes

- Admin cookies are `HttpOnly`, path-scoped to `/`, and expire after 12 hours.
- Cookies use `SameSite=Lax` by default. Split-origin deployments that configure `PUBLIC_FRONTEND_ORIGIN` use `SameSite=None; Secure`.
- State-changing admin requests reject unexpected `Origin` headers.
- Organizer management requires `owner` role.
- Disabling a membership blocks future session validation for that email.
- The Supabase service-role key is used only on the server and must never use a `VITE_` prefix.
