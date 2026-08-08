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

## Deliberate follow-ups

- Paid ticket checkout, refunds, fees, and settlement/reconciliation.
- Sponsor contacts, packages, contracts, due dates, and deliverables.
- Attachments and retention rules for invoices, receipts, and contracts.
- Reimbursements and separation-of-duties approvals.
