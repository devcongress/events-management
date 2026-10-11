# DevCon26 social cards

## Scope

DevCon26 social cards let a named issued attendee or a selected speaker with a confirmed session personalize a share card. They are separate from ticket QR codes, payments, ticket receipts, and speaker-intake links.

## Security and lifecycle

- An Owner issues or rotates a 256-bit management capability through the dedicated social-card delivery command. The raw value is stored only in the dedicated transactional outbox until the provider accepts the email, then it is scrubbed.
- The DevCongress website retains the capability in a URL fragment and supplies it in `X-Social-Card-Capability`; it is never sent in a query string, stored in local storage, rendered in EMS HTML, or logged.
- Management links authorize only one card. Rotation invalidates the prior capability.
- Public sharing is opt-in (`public_enabled`), uses a distinct random public slug, and is revoked by disabling public sharing or revoking the card. Public pages expose no email, ticket, payment, QR, or management-capability data.
- Photos are private Storage objects. EMS never returns their path or a signed URL; the website uses either the header-capability management image endpoint or the scoped public image endpoint after slug authorization. Uploads accept AVIF/JPEG/PNG/WebP and are capped at 5 MiB; the client crop remains bounded to normalized `x/y` and scale values.
- The backend-only website contract is scoped to `https://devcongress.org` (plus localhost/127.0.0.1 only in development), has no credentialed CORS, and exposes only allowlisted management/public DTOs.

## Delivery and operations

`annual_conference_social_card_email_outbox` is independent of `annual_conference_ticket_email_outbox`, with bounded retries, leases, provider identifiers, and capability scrubbing on acceptance. The sender uses `https://devcongress.org/devcon26/social-card/#<capability>` and is gated by `DEVCON26_SOCIAL_CARD_EMAILS_ENABLED=true`, `RESEND_API_KEY`, `DEVCON26_SOCIAL_CARD_EMAIL_FROM`, and `DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO`. Owner issuance fails closed without that complete deployed configuration, so it never reports a queued delivery that no sender can process. The migration removes legacy raw `payload.social_card_capability` values from ticket outbox rows before its old triggers are dropped.

Backups must include the private `annual-conference-social-cards` bucket alongside `meetup-media`. Retain Storage objects only for the card lifetime plus the organization’s approved recovery window; a future retention job must delete superseded photos after the backup window, not immediately after replacement.

## Key files

- `supabase/migrations/20261011100000_annual_conference_social_cards.sql`
- `supabase/migrations/20261011110000_annual_conference_social_card_delivery.sql`
- `lib/annual-conference-social-cards.ts`
- `lib/supabase/annual-conference-social-cards.ts`
- `server/routes/annual-conference-social-cards.ts`

## Activation boundary

The secure persistence, backend-only management/public API, upload boundary, website image proxy, and scheduled sender are implemented. The DevCongress website owns all rendered card and Open Graph pages. This branch does not set the sender’s deployed environment values or apply its migration; those remain a separate operational approval. Image crop derivatives and metadata stripping still need a Worker-native image transformation path.
