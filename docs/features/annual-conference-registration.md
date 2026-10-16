# Annual conference registration

DevCon26 registration is an annual-conference domain, not a monthly meetup or a zero-price payment. The website uses `/api/public/annual-conference/2026/registration`; public duplicate responses never reveal attendee status or admission capabilities.

## Organizer workflow

- Annual Conference → Registration has Summary, Guests, Form & capacity, Emails, and Blasts tabs. Guests combines confirmed, waitlisted, and cancelled registrations with admission actions and optional camera scanning in one list. Manager registrations are linked to admissions strictly by ticket identity; unmatched paid/bearer tickets remain visible. One normalized email owns at most one active registration per edition; cancelled history is retained. Duplicate requests neither rename nor resend. Cancelled registrations cannot self-reactivate.
- Registration managers can change venue capacity in Registration using the existing ticketing-capacity endpoint and validation. Capacity includes confirmed free places, paid orders, active holds, and sponsor allocations. Raising capacity or cancelling a registration promotes available waitlisted places atomically. Checked-in registrations cannot be cancelled.
- Ticketing remains visible but disabled in desktop and mobile navigation, and its legacy organizer route redirects to Registration. Ticketing/order APIs, payment processing, admission credentials, and ticket records remain in place; this is a console-availability change, not a data or sales-state change.
- An Owner explicitly chooses free/paid and draft/open/closed. Resolve the waitlist and active holds before switching to paid. Only Regular intake is allowed. Verified late payments incompatible with the current mode or inventory are recorded as refund-required, never silently accepted as an admission.
- Each attendee update is a new draft with a frozen confirmed audience. Review message and count before queueing. Waitlisted, cancelled, and known suppressed recipients are excluded. These are operational conference notices, not unrelated marketing.

## Cancelled registration recovery

Owners can choose **Recover registration** on a cancelled guest and confirm **Recover and queue email**. Recovery creates a new linked registration from the saved name/email, gives older waitlisted guests priority, and queues a fresh admission QR or waitlist notice. It never reuses the cancelled ticket or retries its terminal email. Repeated requests for the same source return the existing recovery without another email; if that newer registration is cancelled, recover that newer row explicitly.

Apply `20261016190000_cancelled_registration_recovery.sql` before deploying recovery. It replaces all-history email uniqueness with active-email uniqueness, retains same-edition recovery links, and grants the recovery RPC only to the service role. The API additionally requires Owner access, registration management capability, and explicit confirmation. Free intake must be open. Testing restrictions still apply; testing records cannot be recovered after testing is disabled.

Public resubmissions still cannot reactivate any existing email. The generic receipt says **Request received**, explains that duplicates do not queue another email and cancelled registrations stay cancelled, and directs the attendee to contact the team. It reveals neither registration status nor inbox delivery.

## Shared-database rehearsal

### Email activity and safe retry

Registration → Guests exposes a manager-only Email status action. Its contextual right drawer shows that registration's admission/waitlist email records, attempt count, queue/provider-acceptance/delivery timestamps, and errors. Registration → Emails retains the edition-wide list with exact, case-insensitive recipient search and sender readiness. These responses never include QR payloads or private claim capabilities. Provider acceptance is not inbox delivery.

Retry requires inline confirmation and only applies to definite pre-acceptance failures below the attempt limit. Cancelled or superseded messages are terminal and cannot be revived. Apply `20261016173000_registration_email_terminal_retry_guard.sql` before delivering this change; it is a forward function-only migration and does not send mail. Accepted/delivered messages are not offered a duplicate-send action. Separate social-card delivery is not yet included in this activity drawer.

Apply `20261016140000_annual_conference_registration_testing.sql` after the four registration migrations. It does not enable testing or open registration. In Registration, an Owner can save **Testing settings**, enable **Restrict to approved testers**, and add exact email addresses (up to 200). An empty enabled list blocks everyone. Changes require a confirmation modal and take effect without redeploying.

This uses existing records, real capacity, waitlisting, and valid admission QR codes. Testing registrations are marked internally; the public form keeps normal wording. Turning testing off does not delete records, release places, or revoke QR codes. Plan cleanup separately before launch. Removed tester addresses remain blocked for testing-record email even after testing is disabled; messages already in flight or sent cannot be recalled.

For local end-to-end testing, run EMS with `pnpm dev` on localhost:5173 and the website dev server on localhost:4321. The website defaults registration and social-card API requests to local EMS in development; an explicit API-base environment override still wins. Configure the normal email sender settings locally. Open free registration and enable the tester list in EMS. Only a development EMS runtime receiving a loopback URL and Origin can use the no-Turnstile registration path, and the database independently requires enabled testing and an approved address. Hosted previews still require real Turnstile.

After registering an approved address, use **Process queued emails** in local EMS and confirm the real send. The bounded batch processes admission, social-card, and attendee-update queues, with recipient checks before provider calls. Provider acceptance is not inbox delivery. Hosted workers sharing the database may also process eligible queues. Verify inbox receipt, social-card creation, waitlist promotion, and volunteer QR check-in separately; do not claim camera or delivery verification from automated tests.

## Entrance volunteers

Grant an active volunteer `ticketing.check_in` for the relevant edition in conference access management. Registration is their only conference navigation target and opens Guests on the minimal `/check-in` route, without management tabs, registration emails, or cancellation actions. Managers visiting that old route redirect to `/registrations?section=guests`. The shared Guests component loads the edition’s issued and checked-in tickets into a complete, paged name-only roster; volunteers can search names, filter by first letter, and confirm an issued named ticket without starting the camera. An unnamed bearer ticket is QR-only because the manual admission RPC requires a name. The optional QR scanner requests camera access only after the volunteer opens it; native detection falls back to bundled jsQR. Exact email lookup remains server-side and does not return attendee email addresses. Do not admit someone while an error or pending state is shown. An already-checked-in result means do not admit again.

The admission code is private and single-use. Social cards are public-facing artwork, never admission credentials. Multiple volunteers share database-atomic admission status. Internet access and HTTPS are required for real camera check-in. Device-camera testing remains a rollout acceptance check.

## Deployment prerequisites

Apply, through a separately approved rollout, in order:

1. `20261016100000_annual_conference_free_registration.sql`
2. `20261016110000_annual_conference_volunteer_check_in.sql`
3. `20261016120000_annual_conference_attendee_updates.sql`
4. `20261016130000_annual_conference_registration_payment_capacity.sql`

No capacity is reset and free intake is not opened automatically. The payment-confirmation and check-in function contracts intentionally supersede older definitions in the verification manifest. Run offline verification, then the read-only live migration gate against the committed revision before EMS delivery. Do not replay historical migrations wholesale.

Configure verified senders and reply-to: `DEVCON26_ADMISSION_EMAIL_FROM`, `DEVCON26_ADMISSION_EMAIL_REPLY_TO`, `RESEND_API_KEY`; only then set `DEVCON26_ADMISSION_EMAILS_ENABLED=true`. Separate social-card delivery uses existing `DEVCON26_SOCIAL_CARD_*` settings. Annual updates additionally require `DEVCON26_ATTENDEE_UPDATES_ENABLED=true` and quota visibility through `RESEND_BROADCASTS_API_KEY` (or the main key). Existing daily/monthly quota and transactional-reserve settings apply. Configure signed Resend webhooks for delivery, bounce, and complaint events.

The existing scheduler’s fifteenth slot drains a bounded admission batch and then updates. This is not immediate inbox delivery. Acceptance is not delivery; failures past five attempts or one hour are terminal and require reconciliation with provider records. Do not blindly retry or mint another QR after an ambiguous send. Protected ticket-delivery APIs remain available to existing integrations; update counts are visible in Registration.

Allow the website origin in `PUBLIC_API_CORS_ORIGINS` and its host in the Turnstile widget. The website uses the existing `cfp_submission` action and new `conference_registration` action. Annual CFP must be open in EMS. Test preview origins and Turnstile configuration separately; do not weaken production verification for localhost.

## Verification

The exact website branch preview origin `https://feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev` is allowed on the DevCon26 registration GET/POST endpoint and the DevCon26 annual CFP route. Registration and CFP Turnstile checks accept that hostname only for their respective 2026 flows; neither origin is added to general public or organizer CORS. The widget administrator must separately allow that hostname in Cloudflare Turnstile. This does not open registration or CFP, or enable email delivery. Preview registrations and proposals use the configured EMS database, not an isolated sandbox. Deploy the EMS change before testing the hosted preview.

`scripts/test-conference-registration.mjs` is restricted to a disposable local PostgreSQL socket/database. It exercises real migrations, capacity contention, normalized duplicates, cancellation/promotion, concurrent scanning, private grants, reviewed update snapshots, immutable retry payloads, suppression, and late-payment refunds. Vitest covers public/admin access and admission sender behavior without sending email. A production migration or real attendee email is never part of automated local verification.
