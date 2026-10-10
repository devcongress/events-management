# Annual Conference Finance

## Status

Active for the Annual Conference only. Apply the finance migrations and the forward-only integrity hardening migration before using the relational production ledger:

- `20260805010000_annual_conference_finance.sql`
- `20260808070000_annual_conference_income_lifecycle.sql`
- `20260808150000_integrity_hardening.sql`

## Access

Finance is private. A platform Owner can grant an active Organizer **View the finance workspace** in People & Access → Access for a single conference edition. The server checks `finance.view` for reads; Volunteers cannot receive it. Owners remain the only people who can change finance records.

## Income commitments

Manual income starts as an explicit GHS expectation or a directly received amount. For an expected commitment, an Owner can open **Manage** from the finance ledger to:

- record one or more receipts, including partial payments;
- amend the expected amount with a required explanation; or
- cancel an expectation with a required explanation, only while no payment has been recorded.

The original promise is retained. The ledger reports the current expectation, money received, and outstanding balance; it also shows the receipt and amendment history. Expected-income totals mean the outstanding amount still expected, while received-income totals mean cash actually recorded.

## Ticketing and sponsorship boundary

Finance entries carry a source (`manual`, `sponsor`, or `ticket`) and optional source reference. Current data entry creates only `manual` records. Future sponsorship and ticketing modules must own their commitments, payments, refunds, and reconciliation, then publish source-linked finance rows or rollups. Finance must not offer manual edits for those derived rows, preventing duplicate revenue or conflicting balances.

## Data and API surface

- `annual_conference_finance_entries` retains current and original expected amounts and a source marker.
- `annual_conference_finance_income_amendments` records expectation changes and cancellations.
- `annual_conference_finance_income_receipts` records received payments and an idempotency key, so a retried receipt submission cannot create a second payment.
- `PATCH /api/annual-conference/:year/finance/entries/:entryId/expected` amends a manual expectation.
- `POST /api/annual-conference/:year/finance/entries/:entryId/receipts` records a manual-income receipt.
- `POST /api/annual-conference/:year/finance/entries/:entryId/cancel` cancels an unpaid manual expectation.

All financial mutations require an Owner server session, validate their input, run through transactional Supabase functions in production, and add an admin audit event. Local development uses the JSON fallback.

## Ticketing foundation

The ticketing foundation migration (`20261006110000_annual_conference_ticketing_foundation.sql`) creates the edition-scoped settings, paid-order, individual-ticket, and named sponsor-allocation records needed by DevCon26. It starts public inventory at 200, keeps GHS prices in integer pesewas, and makes sponsor allocations private rather than public complimentary ticket tiers. A ticket source is constrained to the same edition, and issued tickets require attendee identity.

The checkout-hold migration (`20261006130000_annual_conference_checkout_holds.sql`) adds a service-role-only reservation command for eventual hosted checkout. It maps the published tier key to its server-owned quantity and price, expires pending orders after 15 minutes, and uses an edition settings lock to count paid seats, sponsor allocations, and live holds in one transaction. A caller-supplied UUID makes network retries return the original order rather than consume another hold; that key is bound to the normalized purchaser and tier so it cannot replay a different cart. The same lock now protects sponsor allocations and capacity reductions. Payment remains inactive until the merchant/provider adapter is deliberately configured; this migration creates neither a public checkout endpoint nor provider credentials.

The Owner ticketing workspace presents this state as an inventory ledger: total capacity, every reservation, and currently available seats are shown separately, including active checkout holds. Capacity changes require a changed valid value and retain the server-enforced reduction floor. Sponsor reservations use labelled fields with local errors, and list private contact details behind an explicit disclosure rather than treating them as primary inventory data.

Ticket prices are edition-scoped integer pesewa fields rather than a client cart value. An Owner can edit the three public prices only while the edition remains in `draft` and no order exists; the database command locks the edition row before checking both conditions. Checkout holds copy their amount from that locked row, so a historical order never depends on later configuration.

The payment-processing migration (`20261006140000_annual_conference_ticket_payment_processing.sql`) adds a server-bound payment-attempt record, provider-event ledger, refund-required ledger, and ticket email outbox. A verified payment transition locks the held order, checks its GHS amount, records the provider event exactly once, marks the order paid, creates one stable numbered ticket row per seat, and queues one idempotent payment receipt in the same transaction. A single-seat order becomes an issued purchaser ticket with a hash-only QR capability and one ticket-delivery outbox item; team seats stay pending until their named attendees are collected. A late provider success re-checks capacity under the edition lock; if the hold can no longer be fulfilled its expired order is paired with a durable refund-required record and no tickets are issued.

The webhook never trusts Paystack metadata to choose an order. It first resolves the server-created reference, then calls Paystack's verification endpoint and retains only a SHA-256 payload fingerprint plus bounded verified payment facts. Ticket QR tokens are intentionally deferred until a named attendee is assigned: the assignment flow will generate the one-time token, store only its hash, and enqueue that named attendee's `ticket_delivery` outbox item. The outbox already retains retry, provider-acceptance, and delivery fields for that later Resend worker.

The assignment/delivery migration (`20261006150000_annual_conference_ticket_assignment_delivery.sql`) makes paid-order tickets non-transferable: a pending team seat can be named once, never reassigned, and gains a hashed QR capability plus a single delivery outbox record. The delivery worker foundation uses `FOR UPDATE SKIP LOCKED`, a ten-minute claim lease, idempotent finalization, bounded retry state, and provider-delivery updates. It stays inactive unless its own explicit Resend email configuration is enabled.

The email-delivery operations migration (`20261006170000_annual_conference_ticket_email_delivery_operations.sql`) gives Owners an edition-scoped operational ledger without exposing email payloads, QR capabilities, idempotency keys, or worker claim leases. It caps automated attempts at five with bounded exponential backoff. An Owner can requeue only a definite pre-provider-acceptance failure; accepted, delivered, claimed, exhausted, and provider-ambiguous records deliberately require review instead of risking a duplicate email. The Ticketing workspace has status filtering and pagination for the full edition history; its health counts are calculated across the edition, not just the visible page. These controls inspect and safely requeue durable records only: no provider send is activated until the explicit Resend sender configuration and delivery worker are separately supplied and enabled.

The live ticket-payment foundation remains disabled unless all three server-only values are deliberately configured: `DEVCON26_PAYMENTS_ENABLED=true`, `DEVCON26_PAYMENT_PROVIDER=paystack`, and `PAYSTACK_SECRET_KEY` containing a nonempty `sk_live_` key. Live confirmation also requires a provider-verified `live` domain; test credentials/results cannot enter the admission-ticket domain. The signed provider webhook does not require organizer login, but all Ticketing operations remain Owner-only. The sandbox described below is independently gated and never calls the live confirmation command.

The forward correction `20261007060000_ticket_email_capability_retention.sql` requires a nonempty provider message id before marking an email accepted. It removes the raw QR capability from ticket-delivery payloads as soon as the provider accepts the message, defensively repeats that scrub during delivery updates, and cleans up previously accepted payloads. Definite pre-acceptance failures retain the token needed for a safe retry; accepted messages must never be blindly resent.

### Isolated public Paystack test checkout

Buyers never log into EMS. The public website owns the modal and Paystack navigation; EMS owns initialization and verification through the following anonymous, exact-origin, rate-limited routes:

- `GET /api/public/annual-conference/2026/test-checkout`: read-only readiness and the fixed GHS test catalog.
- `POST /api/public/annual-conference/2026/test-checkout/initialize`: accepts only `tier_key` and a UUID `checkout_request_key`. A durable lease serializes initialization; initialized retries reuse the same hosted URL. The server supplies price, quantity, currency, controlled test buyer email, provider reference, and callback URL.
- `POST /api/public/annual-conference/2026/test-checkout/verify`: accepts only a server-created `reference`; returns `verified`, `pending`, or `failed` from trusted provider evidence, never browser success claims.
- `POST /api/webhooks/paystack/devcon26-test`: verifies the raw-body HMAC signature, looks up a sandbox reference, and uses the same provider-verification and durable confirmation path. It has no browser CORS or organizer-session requirement.

Apply `20261007050000_devcon26_test_checkout.sql` through an approved migration release before enabling. `devcon26_test_checkout_sessions` and `devcon26_test_payment_events` are RLS-protected and service-role-only; they have no live inventory, finance, ticket, refund, or email effects. Both sandbox catalog and SQL mapping are fixed at GHS 199.99 / 549.99 / 849.99, independent of draft organizer price edits.

Hosted activation requires `DEVCON26_TEST_CHECKOUT_ENABLED=true`, `DEVCON26_PAYMENT_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY=sk_test_…`, `DEVCON26_TEST_BUYER_EMAIL` set to a controlled test inbox, and `PUBLIC_WEBSITE_ORIGIN` set to the exact HTTPS public-site origin. That website is automatically the default allowed sandbox origin; general public CORS configuration is not needed for these sandbox endpoints. The callback is server-derived as `/devcon26/?test_checkout=return`; arbitrary client callback URLs are rejected. Local return origins are allowed only in explicit development mode. Keep `DEVCON26_PAYMENTS_ENABLED=false` and ticket emails disabled while testing.

Website previews use the optional `DEVCON26_TEST_CHECKOUT_ORIGINS` comma-separated allowlist. Each entry must be an exact canonical HTTPS origin with no wildcard, credentials, path, query, or fragment; an invalid nonempty list disables the sandbox. The main `PUBLIC_WEBSITE_ORIGIN` remains the default allowed sandbox origin. Dedicated non-credentialed CORS applies only to the three public sandbox endpoints: it does not grant preview access to public event submission, organizer operations, or either provider webhook. Do not change `PUBLIC_WEBSITE_ORIGIN` or broaden `PUBLIC_API_CORS_ORIGINS` to test a website preview.

After validating the request's `Origin`, EMS derives that origin's `/devcon26/?test_checkout=return` callback. The server namespaces the opaque initialization UUID by origin before persistence, so same-origin retries remain stable while a second preview cannot reuse a hosted URL that returns to the first preview. Existing test records and webhook references remain valid; no database migration is needed for preview support. The current exact branch and commit preview origins are committed as non-secret Wrangler configuration, while `keep_vars = true` preserves dashboard-managed test activation values and secrets.

Replacing the test key with an `sk_live_` key disables this sandbox; it does not turn the public website into live checkout. The live foundation requires its separate activation switch and a public live initialization/customer/inventory workflow before collecting money or issuing real admission tickets.

The Astro website defaults to `https://em.devcongress.org`; `PUBLIC_DEVCON26_API_ORIGIN` can override the API origin at build time. Deploy the corresponding public page before testing the callback, configure Paystack's test webhook URL to the sandbox endpoint, and use only Paystack test payment details. Test success confirms the hosted payment round trip but does not issue an admission ticket or test live seat reservation, attendee assignment, ticket email, QR validation, or settlement. Source-contract tests do not substitute for applying and executing the PostgreSQL migration in an approved isolated environment.

### Test checkout coupons and purchaser tracking

The forward migration `20261010120000_devcon26_test_checkout_coupons.sql` adds coupons only to the isolated sandbox. It creates service-role-only coupon and claim tables, backfills existing sessions with `base_amount_minor = amount_minor` and zero discount, and leaves live orders, seat inventory, finance, admission tickets, and email outboxes unchanged. Coupon terms are immutable in PostgreSQL: only availability and its audit actor can change. Codes are normalized uppercase, unique for 2026, limited to selected pass tiers, time-bound, and capped by completed checkouts plus active holds. Discounts are fixed integer pesewas or integer basis points below 100%; percentage discounts are rounded down to a whole pesewa and every final payment remains positive.

- Ready sandbox `GET /test-checkout` adds `accepts_coupon: true` only after the new storage contract is available.
- Exact-origin, rate-limited `POST /test-checkout/quote` accepts only `{ tier_key, coupon_code? }` and returns `{ mode: "test", tier_key, quantity, currency: "GHS", base_amount_minor, discount_amount_minor, final_amount_minor, coupon_applied }`. A quote is read-only and does not reserve a use.
- `POST /test-checkout/initialize` now also requires bounded `purchaser_name` and `purchaser_email`, with optional `coupon_code`. It reserves a coupon use for 15 minutes under a coupon-row lock and freezes the purchaser, pass, code, and money snapshot. Retry UUIDs are bound to all normalized inputs; mismatched inputs return `checkout_error: "cart_conflict"`, an active initialization lease returns `"in_progress"`, and a terminal or expired checkout returns `"finished"`. Initialized retries return the original hosted URL while the session remains payable.
- Initialization returns the same quote summary with `authorization_url` and `reference`. Verify retains `amount_minor` as the final payment for compatibility and adds the same summary. Public responses never return purchaser identity, coupon IDs, claim data, or provider secrets. Coupon errors expose only `invalid`, `expired`, `ineligible`, or `unavailable`.
- Actual purchaser details stay in the private test session. Paystack continues to receive the controlled `DEVCON26_TEST_BUYER_EMAIL`, so visitors do not receive test-provider messages at their submitted address. Purchaser tracking does not create an attendee or issue an admission ticket.
- Provider-verified test success completes a claim once. Trusted failed or abandoned transactions release it; unknown or pending provider states retain the hold. Abandoned holds cease consuming allowance at expiry and are lazily marked released during the next mutation. Disabling a code does not revoke an existing active hold.
- A late success must reacquire an available coupon use. If the allowance is unavailable, or verified money/currency does not match the frozen snapshot, the session persists `refund_required` and the claim is an exception. This is a test payment that needs Owner attention; no automatic refund or successful ticket outcome is implied. Event replay does not double-count uses.

`devcon26_test_payment_events` stores the latest accepted observation per provider transaction, with its status and matching payload fingerprint updated together; it is not an attempt history. The coupon claims and checkout session ledger retain the durable checkout outcomes.

Owners manage these coupons in **Annual Conference → Ticketing → Test checkout coupons**. `GET/POST /api/annual-conference/2026/ticketing/test-coupons` and `PATCH /:couponId` retain organizer session, Owner authorization, same-origin CSRF checks, and mutation audit. Creation/toggle audit metadata records only coupon ID, year, and availability, never the code or purchaser PII. Both coupon and private purchaser/reference ledgers are bounded and independently paginated; the coupon list shows terms, completed/max uses, active holds, remaining uses, and exceptions. There is no deletion, term editing, public coupon directory, or live coupon model.

This is a coordinated source release, not an applied migration or activated payment feature. The migration replaces the old two-argument prepare RPC and the website must send purchaser fields. Keep public test checkout disabled during an approved rollout, apply the migration, deploy the matching EMS backend and website, verify the new readiness/quote contract, then deliberately restore test activation. Redeploying an older backend after this migration requires a compatible rollback plan. No key replacement makes this sandbox suitable for live payments.

`pnpm exec node scripts/test-devcon26-coupons-postgres.mjs` starts and stops an isolated temporary PostgreSQL cluster and applies only the sandbox migrations and fixture roles. Temporary cluster files and logs are retained for inspection. It exercises concurrent last-use reservation, replay/cart binding, expiry/failure release, completion, late exceptions, rounding, non-positive discounts, eligibility, backfill, immutable terms, permissions, and bounded ledgers without contacting Supabase or Paystack. The script uses `pg_config --bindir`; set `DEVCON26_TEST_POSTGRES_BIN` to select a different PostgreSQL binary directory.

## Deliberate follow-ups

- Public ticket checkout, refunds, fees, and settlement/reconciliation.
- Sponsor contacts, packages, contracts, due dates, and deliverables.
- Attachments and retention rules for invoices, receipts, and contracts.
- Reimbursements and separation-of-duties approvals.
