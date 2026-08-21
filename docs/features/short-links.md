# Short links

DevCongress owns compact marketing links on `go.devcongress.org`. They use opaque five-character codes (for example, `go.devcongress.org/K7M4P`) rather than event titles, so they remain short on flyers and do not disclose event details.

## Supported public destinations

- an open monthly Call for Proposals;
- an open event registration form;
- an open Annual Conference Call for Speakers.
- the evergreen DevCongress volunteer form.

Short links never target management links, speaker follow-up links, review pages, organizer routes, or arbitrary external URLs. A destination is verified again while resolving, so a closed call or registration form does not remain reachable through a stale flyer link.

## Organizer operations

Every currently open monthly CFP, event registration, and Annual Conference CFP has one canonical flyer link. The evergreen volunteer form has one global active link with no event or conference target. Opening the registry backfills any eligible destination that predates this capability; copying an eligible public link in its own workspace creates or reuses the same code thereafter. The public URL stays short and opaque while its destination remains available.

Owners use **Audit Log → Short links** as the registry: copy an active link, inspect its destination and reach, regenerate its code, or revoke it. Regeneration revokes the prior code before issuing the replacement, so there is never more than one active flyer link for a destination. Creation, regeneration, and revocation are recorded in the normal Audit Log; individual flyer visits are aggregated on the link instead of producing noisy audit entries.

## Runtime boundary

`short-links/` is a deliberately small Cloudflare Pages project for `go.devcongress.org`. Its single Pages Function accepts only one opaque path segment and `GET`/`HEAD`, then resolves it through the protected EMS HTTPS resolver. It uses only a server-to-server resolver token, holds no Supabase credentials, does not forward query strings, and rejects any non-first-party path. The catch-all explicitly passes the known `unavailable.css` and `robots.txt` assets through to Pages static hosting; every other non-code path remains fail closed. Unavailable, revoked, stale, or temporarily unreachable links receive the same responsive branded 404 page; it does not disclose whether a code ever existed or why it is unavailable.

## Deployment setup

1. Apply `20260809120000_short_links.sql`, `20260809193000_short_link_canonical_destinations.sql`, `20260820200000_volunteer_short_link_destination.sql`, then `20260820200500_volunteer_short_link_support.sql`.
2. Create the `SHORT_LINK_RESOLVER_TOKEN` secret in both `events-management` and the `devcongress-short-links` Pages project with the same high-entropy value.
3. Create `devcongress-short-links` as a Git-backed Pages project with `short-links` as its root directory and `public` as its build output directory.
4. Add `go.devcongress.org` to that Pages project, then create the DNS record `go CNAME devcongress-short-links.pages.dev` alongside the existing `em` CNAME.
5. Set `SHORT_LINK_PUBLIC_ORIGIN=https://go.devcongress.org` on the EMS Worker. This is a non-secret variable used only when displaying links in Audit Log.

## Key files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260809120000_short_links.sql` | constrained link storage, RLS, indexes, atomic redirect counter |
| `supabase/migrations/20260809193000_short_link_canonical_destinations.sql` | one-active-link invariant and serialized ensure/regenerate RPCs |
| `supabase/migrations/20260820200000_volunteer_short_link_destination.sql` | evergreen volunteer destination enum value |
| `supabase/migrations/20260820200500_volunteer_short_link_support.sql` | target constraint, global one-active-link invariant, and global advisory locking |
| `lib/supabase/short-links.ts` | server-side ensure, regeneration, listing, revocation, resolution |
| `lib/short-link-destinations.ts` | static first-party destination mapping for the evergreen volunteer form |
| `server/app.ts` | share-time ensure API, owner registry controls, audit records, authenticated internal resolver |
| `short-links/functions/[[code]].ts` | isolated public redirect Pages Function and explicit static-asset pass-through |
| `short-links/redirect.ts` | shared validation and EMS resolver boundary |
| `src/views/admin/AdminAuditLogView.vue` | Short links operational subview |
