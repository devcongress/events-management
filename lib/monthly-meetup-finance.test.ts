import { describe, expect, it } from 'vitest';
import {
  MONTHLY_MEETUP_FINANCE_CURRENCY,
  summarizeMonthlyMeetupFinance,
  type MonthlyMeetupFinanceExpense,
} from './monthly-meetup-finance';

const expense = (overrides: Partial<MonthlyMeetupFinanceExpense>): MonthlyMeetupFinanceExpense => ({
  id: 'expense-1',
  event_id: 'event-1',
  category: 'venue',
  description: 'Venue hire',
  amount_minor: 100_00,
  currency: MONTHLY_MEETUP_FINANCE_CURRENCY,
  status: 'paid',
  vendor: null,
  expense_date: '2026-08-06',
  notes: null,
  created_by_email: 'owner@example.com',
  updated_by_email: 'owner@example.com',
  created_at: '2026-08-06T00:00:00.000Z',
  updated_at: '2026-08-06T00:00:00.000Z',
  ...overrides,
});

describe('monthly meetup finance summary', () => {
  it('reports incurred spend separately from paid, unpaid, and cancelled entries', () => {
    const summary = summarizeMonthlyMeetupFinance([
      expense({ id: 'paid', amount_minor: 10_000, status: 'paid' }),
      expense({ id: 'unpaid', amount_minor: 7_500, status: 'unpaid', category: 'catering' }),
      expense({ id: 'cancelled', amount_minor: 2_000, status: 'cancelled' }),
    ]);

    expect(summary).toMatchObject({
      currency: 'GHS',
      actual_spend_minor: 17_500,
      paid_minor: 10_000,
      unpaid_minor: 7_500,
      cancelled_minor: 2_000,
      expense_count: 2,
    });
    expect(summary.by_category).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'venue', incurred_minor: 10_000, paid_minor: 10_000 }),
      expect.objectContaining({ category: 'catering', incurred_minor: 7_500, unpaid_minor: 7_500 }),
    ]));
  });

  it('summarizes categories from the monthly catalog without annual category constants', () => {
    const summary = summarizeMonthlyMeetupFinance([
      expense({ category: 'Community outreach', amount_minor: 4_000 }),
    ], [{ id: 'category-outreach', name: 'Community outreach' }]);

    expect(summary.by_category).toEqual([
      expect.objectContaining({
        category: 'Community outreach',
        incurred_minor: 4_000,
        paid_minor: 4_000,
      }),
    ]);
  });
});
