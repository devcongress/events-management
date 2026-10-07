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

The live ticket-payment foundation remains disabled unless all three server-only values are deliberately configured: `DEVCON26_PAYMENTS_ENABLED=true`, `DEVCON26_PAYMENT_PROVIDER=paystack`, and `PAYSTACK_SECRET_KEY`. The sandbox described below is independently gated and never calls the live confirmation command.

### Isolated public Paystack test checkout

Buyers never log into EMS. The public website owns the modal and Paystack navigation; EMS owns initialization and verification through the following anonymous, exact-origin, rate-limited routes:

- `GET /api/public/annual-conference/2026/test-checkout`: read-only readiness and the fixed GHS test catalog.
- `POST /api/public/annual-conference/2026/test-checkout/initialize`: accepts only `tier_key` and a UUID `checkout_request_key`. A durable lease serializes initialization; initialized retries reuse the same hosted URL. The server supplies price, quantity, currency, controlled test buyer email, provider reference, and callback URL.
- `POST /api/public/annual-conference/2026/test-checkout/verify`: accepts only a server-created `reference`; returns `verified`, `pending`, or `failed` from trusted provider evidence, never browser success claims.
- `POST /api/webhooks/paystack/devcon26-test`: verifies the raw-body HMAC signature, looks up a sandbox reference, and uses the same provider-verification and durable confirmation path. It has no browser CORS or organizer-session requirement.

Apply `20261007050000_devcon26_test_checkout.sql` through an approved migration release before enabling. `devcon26_test_checkout_sessions` and `devcon26_test_payment_events` are RLS-protected and service-role-only; they have no live inventory, finance, ticket, refund, or email effects. Both sandbox catalog and SQL mapping are fixed at GHS 199.99 / 549.99 / 849.99, independent of draft organizer price edits.

Hosted activation requires `DEVCON26_TEST_CHECKOUT_ENABLED=true`, `DEVCON26_PAYMENT_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY=sk_test_…`, `DEVCON26_TEST_BUYER_EMAIL` set to a controlled test inbox, and `PUBLIC_WEBSITE_ORIGIN` set to the exact HTTPS public-site origin. Also allow that origin in `PUBLIC_API_CORS_ORIGINS`. The callback is server-derived as `/devcon26/?test_checkout=return`; arbitrary client callback URLs are rejected. Local return origins are allowed only in explicit development mode. Keep `DEVCON26_PAYMENTS_ENABLED=false` and ticket emails disabled while testing.

The Astro website defaults to `https://em.devcongress.org`; `PUBLIC_DEVCON26_API_ORIGIN` can override the API origin at build time. Deploy the corresponding public page before testing the callback, configure Paystack's test webhook URL to the sandbox endpoint, and use only Paystack test payment details. Test success confirms the hosted payment round trip but does not issue an admission ticket or test live seat reservation, attendee assignment, ticket email, QR validation, or settlement. Source-contract tests do not substitute for applying and executing the PostgreSQL migration in an approved isolated environment.

## Deliberate follow-ups

- Public ticket checkout, refunds, fees, and settlement/reconciliation.
- Sponsor contacts, packages, contracts, due dates, and deliverables.
- Attachments and retention rules for invoices, receipts, and contracts.
- Reimbursements and separation-of-duties approvals.
