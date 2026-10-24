# Annual conference registration

DevCon26 registration is an annual-conference domain, not a monthly meetup or a zero-price payment. The website uses `/api/public/annual-conference/2026/registration`; public duplicate responses never reveal attendee status or admission capabilities.

## Flexible paid tickets (2026)

The paid path is GH₵150 per person. A public cart may mix a buyer's own seat, a named gift, an organizer-managed community seat, and a buyer-distributed private claim. A named gift is bound to its recipient email; community claims require the claimant to supply their own details. The managed community pool reserves funded seats until an authorized organizer assigns them. Sponsorship allocations are created in EMS, outside public checkout. The current EMS sponsor action reserves capacity only; it does not issue QR codes or send sponsor email. Historical buyer-managed public orders retain their existing management actions. Social badges are shareable artwork and never contain admission QR codes.

The organizer's 2026 pricing panel and new test checkouts show only the individual GH₵150 ticket. The three/five-seat columns and historical orders remain in storage for compatibility; they are not new products. New 2026 price edits and public buyer-managed allocation requests are rejected by the API.

The pricing-reconciliation migration `20261021120000_devcon26_ticket_price_reconciliation.sql` changes the 2026 stored regular price from GH₵199.99 to GH₵150 and the legacy three/five-seat totals to GH₵450/GH₵750 only when no checkout order of any status exists and the flexible checkout remains at `foundation`. It also changes future row defaults. The existing test quote and coupon functions already read these stored prices, so existing test sessions retain their original snapshots while future quotes use the corrected amounts. It fails on an unexpected price or active state and does not open checkout. Apply and verify this migration before enabling the website's flexible checkout; applying code alone leaves the public catalog on the stored old price.

Paystack is the only current payment provider, so the website selects it automatically. The API returns an explicit provider catalog for adding a choice later. The price and quantity are revalidated by EMS before initializing payment. There is no arbitrary buyer quantity cap, but a single Paystack payment cannot exceed its provider amount ceiling or the current capacity. A larger purchase requires additional orders. Payment verification, ticket issuance, recipient claims, and email queueing occur on the server; checkout and claim URLs alone do not prove admission.

Registration → Community seats gives Owners a paged list of unassigned, already-paid organizer-managed places. An Owner supplies the recipient's name and email, reviews the irreversible assignment, and queues that person's admission message. This action is edition-scoped and idempotent; it cannot reassign an issued or checked-in ticket. Other ticketing managers cannot see or use this queue.

Apply these forward migrations in order before any paid-flow activation:

1. `20261020100000_annual_conference_flexible_ticket_allocation_foundation.sql`
2. `20261020110000_annual_conference_flexible_ticket_lifecycle.sql`
3. `20261020120000_devcon26_test_checkout_preview_email_authorization.sql`
4. `20261020140000_annual_conference_closed_price_setup.sql` (required to configure the GH₵150 sandbox price while free registration stays closed)

The schema starts with `flexible_checkout_state='foundation'`; it does not open sales. The Worker additionally requires `DEVCON26_FLEXIBLE_CHECKOUT_ENABLED=true`, existing live Paystack and admission-email readiness, the public checkout origin configuration, and Owner-controlled paid/open ticketing settings. The separate `DEVCON26_FLEXIBLE_TICKET_ACCESS_ENABLED=true` switch keeps already-paid claim and management links usable even if sales are paused; it still requires an exact allowed website origin. Do not switch to `public` until the full claim, organizer assignment, email, refund, preview, and check-in journeys have been reviewed against the deployed revision. A refund request is an operational record, not money returned; provider refund verification is required before any final cancellation is reported as reimbursed.

For feature-branch previews, the separate test-checkout path may email entered tester addresses only with an exact preview origin, Turnstile action/hostname, enabled preview-email flags, verified Paystack test payment, recipient screening, and distributed rate limits. The message is marked as a test and contains no seat or QR. The current website branch origin `https://feature-devcon26-flexible-ticket-checkout-devcongress-website.admins-a7d.workers.dev` must be on both the test-checkout and preview-email origin allowlists, and its hostname must be permitted by the matching Turnstile widget. The GH₵150 test catalog may open with the shared conference still free/closed; live sales remain separately gated. Neither preview email nor local migration tests authorize production ticket sales.

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

## Full-flow Paystack preview testing (2026-10-21)

The separately enabled `/api/public/annual-conference/2026/complete-test-checkout`
path uses Paystack test payments with the real flexible-cart issuance, private
claims, admission email, and social-card delivery queues. The live checkout key
and domain checks remain unchanged. Preview configuration requires
`DEVCON26_COMPLETE_TEST_ENABLED=true`, one exact
`DEVCON26_COMPLETE_TEST_ORIGIN` on the feature preview hostname, and a test key in
`PAYSTACK_TEST_SECRET_KEY` (or the existing `PAYSTACK_SECRET_KEY` only if it is a
test key). `TURNSTILE_SECRET_KEY` is mandatory; the website widget must permit the exact preview hostname. No secret is exposed to the website. Build the preview with
`PUBLIC_DEVCON26_COMPLETE_TEST=true`; omit it for the production website.

Apply the reviewed `20261021150000_complete_test_ticket_checkout.sql` before
backend deployment. It adds permanent test provenance, internal-only lifecycle
activation, domain/recipient guards, test-aware email leases and a test badge
marker, and a database guard blocking public launch while any test orders remain. It does not enable tester settings, public sales, send email, delete
records, or change historical payment modes. Its catalog contract supersedes the
price-reconciliation contract's `foundation` state assertion with `internal`.

Owner-managed Registration testing must be enabled and include every buyer,
gift recipient, and later community claimant. Both admission and social-card
senders must be configured. Test tickets use shared capacity until an explicitly
authorized cleanup; orders display TEST PAYMENT and simulated amounts (GH₵0 charged). The database rejects activation of `public` checkout while any test orders remain, including expired or cancelled orders. A separately reviewed cleanup must remove their dependent artifacts before live launch. Test QR codes cannot be checked
in, test refunds cannot enter the live refund workflow, and test badges cannot be
published publicly. Badge downloads visibly carry TEST. Email subjects/bodies
identify testing without live admission promises. Test QR PNGs carry TEST ONLY / NOT VALID FOR ADMISSION bands outside the scannable QR area. Private management, claim, and badge links return to the
order's immutable preview origin. Disabling testing or removing a recipient
holds further test delivery. The existing scheduler drains the queues; queued,
provider-accepted, delivered, and inbox receipt remain separate evidence.

Set the Paystack test webhook to the separately signed
`/api/webhooks/paystack/devcon26-complete-test` endpoint. Browser return also
verifies payments; both paths use the same provider event identifier for
idempotency. Keep the complete-test flag disabled until the migration, schema
gate, tester list, exact origin and senders have been verified. Before launch,
disable the test endpoint and review an explicit cleanup of test orders and
their dependent tickets, cards, claims and outboxes. No automatic purge is part
of this change. Existing test admission QR codes remain unusable at the event.

Complete-test initialization requires a single-use Turnstile token bound to `devcon26_complete_test_checkout` and the exact preview hostname. Existing durable rate limits cap attempts at 20 per IP per 5 minutes, 100 per IP per day, 50 per distinct approved buyer/gift recipient per day, and 500 shared per day. Tester membership is checked before daily budgets are consumed; database checks remain authoritative.

### Preview-only delivery scope

The follow-up `20261021160000_preview_only_ticket_email_leasing.sql` adds two
service-only claim functions scoped to allowed test orders and their exact
preview origin. Terminal retry updates and leases exclude all unrelated mail.
When complete-test configuration validates, senders use these functions and the
admission retry route skips attendee updates. Invalid enabled preview configuration
fails closed instead of falling back to generic queues. Apply only after review.

The feature website must permit the exact EMS preview backend in its build-time
CSP. The additional connect source is included only when both the complete-test
flag and exact backend build variable match; ordinary website builds stay unchanged.

The separate `tools/complete-test-email-relay` Worker runs once per minute and
has no public HTTP endpoint. It first confirms the fixed preview catalog is in
test mode, then invokes the preview admission and social-card retry endpoints
independently using `SLACK_EVENTS_RETRY_SECRET`. Redirects are rejected, requests
have deadlines, and errors do not log authentication values or provider bodies.
Its configuration is separate from the main Worker; committing it does not
change the production schedule. It must not be repointed at production.

Both reviewed migrations were applied separately by the user before this PR.
Publishing the branch does not apply SQL, clean test records, send historical
queued messages, or deploy either Worker. Full payment-to-inbox acceptance
remains pending user testing; disposable PostgreSQL and unit checks verify the
transactional and queue-isolation invariants without exercising live delivery.

Verified complete-test returns include a separate buyer badge grant only for the self allocation. Its signed seat scope prevents editing gifted seats, and preview buyer routes recheck paid/test/origin provenance and testing enablement. The relay checks dispatcher result counts as well as HTTP status; HTTP 200 with missing configuration or failed deliveries is not treated as success.

The preview ticket QR email includes event date/venue and a separate seat-scoped badge grant valid for 30 days; this does not depend on the raw capability scrubbed after the standalone badge email is accepted. The existing personal badge link remains valid. `20261023001000_preview_admission_email_finalization.sql` adds a preview-only finalizer with integer retry intervals and claim-token ownership, leaving the production function untouched. Application is a separate user-reviewed operation.


### Combined preview ticket email (v2)

New preview holds use `create_complete_test_hold_v2` after applying `20261023010000_preview_combined_ticket_email.sql`. The immutable order opt-in is test-only. Applying the migration alone does not activate this path; the updated preview Worker must create new orders through the v2 RPC. Existing request keys are not upgraded.

For a self ticket, first issuance atomically merges purchaser management access into the ticket email and includes a seat-scoped badge link. The QR is a branded PDF attachment, not an inline image. Separate EMS receipt and first-issue badge messages are not queued. Paystack owns payment receipts. Gift-only purchasers still receive management access, gift recipients receive claim invitations, and claimed gifts receive their own PDF/badge email without purchaser management access. Explicit later badge email inserts are not suppressed.

Existing rows, prior accepted provider payloads, live orders, and unrelated queued badge mail are unchanged. The sender freezes HTML, text, and PDF bytes under the existing idempotency key before delivery. Old preview and live email rendering remains unchanged until a separately reviewed rollout. Custom email fonts have system fallbacks; actual mail clients may override dark-mode CSS.

Preview paid verification and signed payment webhooks start a bounded admission outbox drain using Worker waitUntil. The minute relay remains the retry fallback and rejects redirects without forwarding credentials. Registration email Details opens a right drawer rather than expanding the list.
