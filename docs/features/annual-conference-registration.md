# Annual conference registration

DevCon26 registration is an annual-conference domain, not a monthly meetup or a zero-price payment. The website uses `/api/public/annual-conference/2026/registration`; public duplicate responses never reveal attendee status or admission capabilities.

## Organizer workflow

- Annual Conference → Registration lists confirmed attendees and the FIFO waitlist. One normalized email owns one registration per edition. Duplicate requests neither rename nor resend. Cancelled registrations cannot self-reactivate.
- Capacity remains in Ticketing and includes confirmed free places, paid orders, active holds, and sponsor allocations. Raising capacity or cancelling a registration promotes available waitlisted places atomically. Checked-in registrations cannot be cancelled.
- An Owner explicitly chooses free/paid and draft/open/closed. Resolve the waitlist and active holds before switching to paid. Only Regular intake is allowed. Verified late payments incompatible with the current mode or inventory are recorded as refund-required, never silently accepted as an admission.
- Each attendee update is a new draft with a frozen confirmed audience. Review message and count before queueing. Waitlisted, cancelled, and known suppressed recipients are excluded. These are operational conference notices, not unrelated marketing.

## Entrance volunteers

Grant an active volunteer `ticketing.check_in` for the relevant edition in conference access management. They open Annual Conference → Check-in on their phone and explicitly open the camera. Native QR detection falls back to bundled jsQR; denied camera access has paste and name/email lookup alternatives. Do not admit someone while an error or pending state is shown. An already-checked-in result means do not admit again.

The admission code is private and single-use. Social cards are public-facing artwork, never admission credentials. Multiple volunteers share database-atomic admission status. Internet access and HTTPS are required for real camera check-in. Device-camera testing remains a rollout acceptance check.

## Deployment prerequisites

Apply, through a separately approved rollout, in order:

1. `20261016100000_annual_conference_free_registration.sql`
2. `20261016110000_annual_conference_volunteer_check_in.sql`
3. `20261016120000_annual_conference_attendee_updates.sql`
4. `20261016130000_annual_conference_registration_payment_capacity.sql`

No capacity is reset and free intake is not opened automatically. The payment-confirmation and check-in function contracts intentionally supersede older definitions in the verification manifest. Run offline verification, then the read-only live migration gate against the committed revision before EMS delivery. Do not replay historical migrations wholesale.

Configure verified senders and reply-to: `DEVCON26_ADMISSION_EMAIL_FROM`, `DEVCON26_ADMISSION_EMAIL_REPLY_TO`, `RESEND_API_KEY`; only then set `DEVCON26_ADMISSION_EMAILS_ENABLED=true`. Separate social-card delivery uses existing `DEVCON26_SOCIAL_CARD_*` settings. Annual updates additionally require `DEVCON26_ATTENDEE_UPDATES_ENABLED=true` and quota visibility through `RESEND_BROADCASTS_API_KEY` (or the main key). Existing daily/monthly quota and transactional-reserve settings apply. Configure signed Resend webhooks for delivery, bounce, and complaint events.

The existing scheduler’s fifteenth slot drains a bounded admission batch and then updates. This is not immediate inbox delivery. Acceptance is not delivery; failures past five attempts or one hour are terminal and require reconciliation with provider records. Do not blindly retry or mint another QR after an ambiguous send. Existing Ticketing delivery operations expose admission failures; update counts are visible in Registration.

Allow the website origin in `PUBLIC_API_CORS_ORIGINS` and its host in the Turnstile widget. The website uses the existing `cfp_submission` action and new `conference_registration` action. Annual CFP must be open in EMS. Test preview origins and Turnstile configuration separately; do not weaken production verification for localhost.

## Verification

The exact website branch preview origin `https://feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev` is allowed only on the DevCon26 registration GET/POST endpoint and in that route's Turnstile hostname validation. It is not added to general public or organizer CORS. The widget administrator must separately allow that hostname in Cloudflare Turnstile; this does not open registration or enable email delivery. Preview registrations use the configured EMS database, not an isolated sandbox. Deploy the EMS change before testing the hosted preview.

`scripts/test-conference-registration.mjs` is restricted to a disposable local PostgreSQL socket/database. It exercises real migrations, capacity contention, normalized duplicates, cancellation/promotion, concurrent scanning, private grants, reviewed update snapshots, immutable retry payloads, suppression, and late-payment refunds. Vitest covers public/admin access and admission sender behavior without sending email. A production migration or real attendee email is never part of automated local verification.
