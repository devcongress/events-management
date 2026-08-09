# Short links

DevCongress owns compact marketing links on `go.devcongress.org`. They use opaque five-character codes (for example, `go.devcongress.org/K7M4P`) rather than event titles, so they remain short on flyers and do not disclose event details.

## Supported public destinations

- an open monthly Call for Proposals;
- an open event registration form;
- an open Annual Conference Call for Speakers.

Short links never target management links, speaker follow-up links, review pages, organizer routes, or arbitrary external URLs. A destination is verified again while resolving, so a closed call or registration form does not remain reachable through a stale flyer link.

## Organizer operations

Owners use **Audit Log → Short links** to create, copy, inspect, and revoke links. The view shows the public code, destination, status, total redirects, and last redirect time. Creation and revocation are recorded in the normal Audit Log; individual flyer visits are aggregated on the link instead of producing noisy audit entries.

## Runtime boundary

`short-links/` is a deliberately small Cloudflare Pages project for `go.devcongress.org`. Its single Pages Function accepts only one opaque path segment and `GET`/`HEAD`, then resolves it through the protected EMS HTTPS resolver. It uses only a server-to-server resolver token, holds no Supabase credentials, does not forward query strings, and rejects any non-first-party path. Unavailable, revoked, stale, or temporarily unreachable links receive a branded 404 response.

## Deployment setup

1. Apply `20260809120000_short_links.sql`.
2. Create the `SHORT_LINK_RESOLVER_TOKEN` secret in both `events-management` and the `devcongress-short-links` Pages project with the same high-entropy value.
3. Create `devcongress-short-links` as a Git-backed Pages project with `short-links` as its root directory and `public` as its build output directory.
4. Add `go.devcongress.org` to that Pages project, then create the DNS record `go CNAME devcongress-short-links.pages.dev` alongside the existing `em` CNAME.
5. Set `SHORT_LINK_PUBLIC_ORIGIN=https://go.devcongress.org` on the EMS Worker. This is a non-secret variable used only when displaying links in Audit Log.

## Key files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260809120000_short_links.sql` | constrained link storage, RLS, indexes, atomic redirect counter |
| `lib/supabase/short-links.ts` | server-side creation, listing, revocation, resolution |
| `server/app.ts` | owner APIs, audit records, authenticated internal resolver |
| `short-links/functions/[[code]].ts` | isolated public redirect Pages Function |
| `short-links/redirect.ts` | shared validation and EMS resolver boundary |
| `src/views/admin/AdminAuditLogView.vue` | Short links operational subview |
