# DevCon26 social cards

## Scope

DevCon26 social cards let an accepted speaker personalize a badge from their private speaker workspace, and let a paid ticket buyer optionally personalize one card for each issued ticket in their order. Speaker eligibility begins when the proposal is selected and remains tied to its selected session; a speaker availability confirmation is not required. Archived sessions are ineligible. They are separate from ticket QR codes, check-in, payment receipts, and speaker-intake links. A buyer can leave any card untouched and return from the same private email link later; no photo is required.

The speaker workspace leads with publicity details and keeps badge customization in an optional disclosure. A speaker can reuse the saved badge's original photo as their publicity headshot. That operation stores a separate private copy, so changing or removing the badge photo does not change the organizers' headshot. Uploading a headshot or providing a link does not silently replace an existing badge photo or crop.

Volunteers with active EMS Volunteer access sign in with their approved Google account and open the badge editor from the DevCon26 overview on desktop or phone. They can personalize the name and optionally add a portrait. The volunteer draft and photo stay in the browser for the current visit. Volunteers and speakers can download the PNG or share it through the device share sheet on supported browsers. The exported artwork carries no admission credential.

## Security and lifecycle

- An Owner issues or rotates a 256-bit management capability through the dedicated social-card delivery command. The raw value is stored only in the dedicated transactional outbox until the provider accepts the email, then it is scrubbed.
- The DevCongress website retains the capability in a URL fragment and supplies it in `X-Social-Card-Capability`; it is never sent in a query string, stored in local storage, rendered in EMS HTML, or logged.
- Speaker workspace badge access validates the current, unrevoked, unexpired workspace link, selected submission and its selected session on every request. The workspace edits the existing session social-card record; it does not create a second badge model. Organizers with `speakers.view` can preview and export the same saved record. Browser PNG and bulk ZIP exports use the same renderer and keep image processing in the browser.
- Speaker/organizer management links authorize one card. A buyer collection link authorizes only the issued seats in its paid order and becomes unusable if that order is no longer paid; it never grants access to tickets, payment data, QR codes, or other orders.
- A first paid transition creates one card slot per issued ticket and one idempotent collection-email record in the same database transaction. Historical orders are not backfilled. The sandbox checkout has its own verifier and never creates real collection links or admission-card slots.
- Public ticket checkout is a separate, fail-closed route family. It requires `DEVCON26_PUBLIC_CHECKOUT_ENABLED=true`, Paystack as provider, the existing payment enablement flag and live secret, an exact HTTPS website origin allowlist, open ticket sales, and ready ticketing storage. Initialization creates the usual EMS checkout hold and Paystack payment attempt; the browser receives a short-lived, order-bound buyer grant and verifier in the checkout response. The fixed payment callback must be server-verified before the UI unlocks the buyer editor. No buyer grant is stored in a URL or local storage.
- The paid buyer editor is limited to the issued seats belonging to the verified order. It can update the display name and private photo, but cannot enable public listing, read payment/customer details, or act on other orders. The “do this later” option is shown only when the existing collection-email delivery is configured; the sandbox preview is local-only and is not saved or emailed.
- Public sharing is opt-in (`public_enabled`), uses a distinct random public slug, and is revoked by disabling public sharing or revoking the card. Public pages expose no email, ticket, payment, QR, or management-capability data.
- Photos are private Storage objects. EMS never returns their path or a signed URL; the website uses either the header-capability management image endpoint or the scoped public image endpoint after slug authorization. Uploads accept AVIF/JPEG/PNG/WebP and are capped at 5 MiB; the client crop remains bounded to normalized `x/y` and scale values.
- The backend-only website contract is scoped to `https://devcongress.org` (plus localhost/127.0.0.1 only in development), has no credentialed CORS, and exposes only allowlisted management/public DTOs.

## Delivery and operations

`annual_conference_social_card_email_outbox` is independent of `annual_conference_ticket_email_outbox`, with bounded retries, leases, provider identifiers, and capability scrubbing on acceptance. The sender uses `https://devcongress.org/devcon26/social-card/#<capability>` for a single card and `https://devcongress.org/devcon26/social-card/#collection=<capability>` for a buyer's ticket cards. It is gated by `DEVCON26_SOCIAL_CARD_EMAILS_ENABLED=true`, `RESEND_API_KEY`, `DEVCON26_SOCIAL_CARD_EMAIL_FROM`, and `DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO`; without that complete configuration the worker fails closed and no buyer email is sent. The migration removes legacy raw `payload.social_card_capability` values from ticket outbox rows before its old triggers are dropped.

Backups must include the private `annual-conference-social-cards` bucket alongside `meetup-media`. Retain Storage objects only for the card lifetime plus the organization’s approved recovery window; a future retention job must delete superseded photos after the backup window, not immediately after replacement.

## Key files

- `supabase/migrations/20261011100000_annual_conference_social_cards.sql`
- `supabase/migrations/20261011110000_annual_conference_social_card_delivery.sql`
- `supabase/migrations/20261012160000_annual_conference_social_card_collections.sql`
- `lib/annual-conference-social-cards.ts`
- `lib/annual-conference-social-card-buyer-grant.ts`
- `lib/devcon26-public-checkout.ts`
- `lib/supabase/annual-conference-social-cards.ts`
- `server/routes/annual-conference-social-cards.ts`
- `server/routes/annual-conference-speaker-badges.ts`
- `src/components/SpeakerBadgeEditor.vue`, `src/components/SpeakerBadgePreview.vue`, and `src/lib/speaker-badge.ts`
- `src/lib/devcon26-digital-badge.ts` and its badge artwork and font assets: copied from the DevCongress website implementation as an independent renderer, not a shared package
- `server/routes/annual-conference-ticketing.ts`

## Activation boundary

The secure persistence, backend-only management/public API, upload boundary, website image proxy, and scheduled sender are implemented. The buyer checkout bridge is available only after its separate production flags/origins are explicitly configured; this source change does not enable live checkout, set email sender environment values, apply migrations, or deploy either app. The website continues to own its rendered public card and Open Graph pages; EMS renders private speaker previews and downloads with its copied renderer. Existing separately issued website management links and opted-in public cards also verify that the selected session is still eligible. The legacy owner-issued email delivery command retains its separate confirmed-session issuance requirement. Image crop derivatives and metadata stripping still need a Worker-native image transformation path.
