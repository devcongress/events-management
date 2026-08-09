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

`short-links/worker.ts` is a deliberately small Cloudflare Worker for `go.devcongress.org`. It accepts only one opaque path segment and `GET`/`HEAD`, then resolves it through a service binding to EMS. It uses only a server-to-server resolver token, holds no Supabase credentials, does not forward query strings, and rejects any non-first-party path. Unavailable, revoked, or stale links receive a branded 404 response.

## Deployment setup

1. Apply `20260809120000_short_links.sql`.
2. Create the `SHORT_LINK_RESOLVER_TOKEN` secret in both `events-management` and `devcongress-short-links` Workers with the same high-entropy value.
3. Deploy the short-link Worker using `pnpm exec wrangler deploy --config short-links/wrangler.toml`.
4. Attach `go.devcongress.org` as its custom domain in Cloudflare. The `devcongress.org` zone must be Cloudflare-managed.
5. Set `SHORT_LINK_PUBLIC_ORIGIN=https://go.devcongress.org` on the EMS Worker. This is a non-secret variable used only when displaying links in Audit Log.

## Key files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260809120000_short_links.sql` | constrained link storage, RLS, indexes, atomic redirect counter |
| `lib/supabase/short-links.ts` | server-side creation, listing, revocation, resolution |
| `server/app.ts` | owner APIs, audit records, authenticated internal resolver |
| `short-links/worker.ts` | isolated public redirect Worker |
| `src/views/admin/AdminAuditLogView.vue` | Short links operational subview |
