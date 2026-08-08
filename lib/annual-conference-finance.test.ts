import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  hydrateAnnualConferenceFinanceEntries,
  summarizeAnnualConferenceFinance,
  type AnnualConferenceFinanceBudgetLine,
  type AnnualConferenceFinanceEntry,
} from './annual-conference-finance';

const budget = (overrides: Partial<AnnualConferenceFinanceBudgetLine> = {}): AnnualConferenceFinanceBudgetLine => ({
  id: 'budget-1',
  edition_id: 'edition-1',
  category: 'venue',
  label: 'Venue',
  amount_minor: 100_000,
  currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  created_by_email: 'owner@example.com',
  updated_by_email: 'owner@example.com',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
  ...overrides,
});

const entry = (overrides: Partial<AnnualConferenceFinanceEntry> = {}): AnnualConferenceFinanceEntry => ({
  id: 'entry-1',
  edition_id: 'edition-1',
  kind: 'expense',
  category: 'venue',
  description: 'Venue deposit',
  amount_minor: 25_000,
  currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  status: 'committed',
  vendor: null,
  entry_date: '2026-08-05',
  notes: null,
  created_by_email: 'owner@example.com',
  updated_by_email: 'owner@example.com',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
  ...overrides,
  original_amount_minor: overrides.original_amount_minor ?? 25_000,
  source_type: overrides.source_type ?? 'manual',
  source_reference: overrides.source_reference ?? null,
  received_amount_minor: overrides.received_amount_minor ?? 0,
  outstanding_amount_minor: overrides.outstanding_amount_minor ?? 0,
});

describe('annual conference finance summary', () => {
  it('keeps planned, committed, paid, unpaid, and income totals distinct', () => {
    const summary = summarizeAnnualConferenceFinance(
      [budget()],
      [
        entry(),
        entry({ id: 'entry-2', amount_minor: 10_000, status: 'paid' }),
        entry({ id: 'entry-3', kind: 'income', category: 'other', amount_minor: 80_000, status: 'expected', outstanding_amount_minor: 80_000 }),
        entry({ id: 'entry-4', kind: 'income', category: 'other', amount_minor: 50_000, status: 'received', received_amount_minor: 50_000 }),
      ],
    );

    expect(summary).toMatchObject({
      currency: 'GHS',
      planned_budget_minor: 100_000,
      committed_minor: 35_000,
      paid_minor: 10_000,
      remaining_minor: 65_000,
      unpaid_committed_minor: 25_000,
      income_expected_minor: 80_000,
      income_received_minor: 50_000,
      net_cash_minor: 40_000,
    });
    expect(summary.by_category).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'venue', planned_minor: 100_000, committed_minor: 35_000, paid_minor: 10_000 }),
    ]));
  });

  it('allows negative remaining budget to surface overspend', () => {
    const summary = summarizeAnnualConferenceFinance(
      [budget({ amount_minor: 10_000 })],
      [entry({ amount_minor: 15_000, status: 'paid' })],
    );

    expect(summary.remaining_minor).toBe(-5_000);
  });

  it('keeps a revised income expectation, partial receipts, and the remaining amount distinct', () => {
    const income = entry({
      id: 'income-1',
      kind: 'income',
      category: 'other',
      amount_minor: 75_000,
      original_amount_minor: 100_000,
      status: 'partially_received',
    });
    const [hydratedIncome] = hydrateAnnualConferenceFinanceEntries([income], [{
      id: 'receipt-1',
      entry_id: income.id,
      amount_minor: 30_000,
      received_date: '2026-08-08',
      payment_reference: 'MOMO-123',
      notes: null,
      created_by_email: 'owner@example.com',
      created_at: '2026-08-08T00:00:00.000Z',
    }]);
    const summary = summarizeAnnualConferenceFinance([], [hydratedIncome]);

    expect(hydratedIncome).toMatchObject({
      original_amount_minor: 100_000,
      amount_minor: 75_000,
      received_amount_minor: 30_000,
      outstanding_amount_minor: 45_000,
    });
    expect(summary).toMatchObject({
      income_expected_minor: 45_000,
      income_received_minor: 30_000,
      net_cash_minor: 30_000,
    });
  });
});
