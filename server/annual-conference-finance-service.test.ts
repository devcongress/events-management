import { describe, expect, it, vi } from 'vitest';
import {
  ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  type AnnualConferenceFinanceSnapshot,
} from '@/lib/annual-conference-finance';
import { createAnnualConferenceFinanceService } from './annual-conference-finance-service';

const snapshot: AnnualConferenceFinanceSnapshot = {
  edition_id: 'edition-1',
  budgets: [],
  entries: [],
  income_amendments: [],
  income_receipts: [],
};

const incomeEntry = {
  id: 'income-1',
  edition_id: 'edition-1',
  kind: 'income' as const,
  category: 'other' as const,
  description: 'Community sponsor support',
  amount_minor: 100_000,
  original_amount_minor: 100_000,
  currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  status: 'expected' as const,
  source_type: 'manual' as const,
  source_reference: null,
  received_amount_minor: 0,
  outstanding_amount_minor: 100_000,
  vendor: 'Example sponsor',
  entry_date: '2026-08-08',
  notes: null,
  created_by_email: 'owner@example.com',
  updated_by_email: 'owner@example.com',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

function service(role: 'owner' | 'organizer', financeSnapshot = snapshot) {
  const repository = {
    getFinance: vi.fn(async () => financeSnapshot),
    createBudgetLine: vi.fn(async () => ({
      id: 'budget-1',
      edition_id: 'edition-1',
      category: 'venue' as const,
      label: 'Venue',
      amount_minor: 100_000,
      currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
      created_by_email: 'owner@example.com',
      updated_by_email: 'owner@example.com',
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
    })),
    createEntry: vi.fn(async () => ({
      id: 'entry-1',
      edition_id: 'edition-1',
      kind: 'expense' as const,
      category: 'venue' as const,
      description: 'Venue deposit',
      amount_minor: 25_000,
      original_amount_minor: 25_000,
      currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
      status: 'committed' as const,
      source_type: 'manual' as const,
      source_reference: null,
      received_amount_minor: 0,
      outstanding_amount_minor: 0,
      vendor: null,
      entry_date: null,
      notes: null,
      created_by_email: 'owner@example.com',
      updated_by_email: 'owner@example.com',
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
    })),
    amendIncomeExpectation: vi.fn(async () => ({ ...incomeEntry, amount_minor: 75_000, outstanding_amount_minor: 75_000 })),
    recordIncomeReceipt: vi.fn(async () => ({ ...incomeEntry, status: 'partially_received' as const, received_amount_minor: 25_000, outstanding_amount_minor: 75_000 })),
    cancelIncomeExpectation: vi.fn(async () => ({ ...incomeEntry, status: 'cancelled' as const, outstanding_amount_minor: 0 })),
  };
  const audit = vi.fn(async () => undefined);
  const finance = createAnnualConferenceFinanceService({
    repository,
    actor: { role, email: role === 'owner' ? 'owner@example.com' : 'organizer@example.com' },
    audit,
  });
  return { finance, repository, audit };
}

describe('Annual Conference finance service', () => {
  it('lets an Organizer with finance visibility read the summary', async () => {
    const { finance } = service('organizer');

    await expect(finance.getFinance(2026)).resolves.toMatchObject({
      edition_id: 'edition-1',
      summary: {
        currency: 'GHS',
        planned_budget_minor: 0,
      },
      permissions: { can_manage: false },
    });
  });

  it('keeps first-slice finance mutations Owner-only and audits them', async () => {
    const { finance, repository, audit } = service('owner');

    await finance.createBudgetLine(2026, {
      category: 'venue',
      label: 'Venue',
      amount_minor: 100_000,
    });

    expect(repository.createBudgetLine).toHaveBeenCalledWith('edition-1', expect.anything(), 'owner@example.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'annual_conference.finance.budget_create',
    }));
  });

  it('rejects finance mutations for read-only Organizers', async () => {
    const { finance } = service('organizer');

    await expect(finance.createEntry(2026, {
      kind: 'expense',
      category: 'venue',
      description: 'Venue deposit',
      amount_minor: 25_000,
      status: 'committed',
    })).rejects.toMatchObject({ code: 'forbidden' });

    await expect(finance.recordIncomeReceipt(2026, 'entry-1', {
      amount_minor: 10_000,
      received_date: '2026-08-08',
    })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('audits owner changes to a manual income expectation', async () => {
    const { finance, repository, audit } = service('owner', { ...snapshot, entries: [incomeEntry] });

    await finance.amendIncomeExpectation(2026, incomeEntry.id, {
      amount_minor: 75_000,
      reason: 'Sponsor reduced its commitment.',
    });
    await finance.recordIncomeReceipt(2026, incomeEntry.id, {
      amount_minor: 25_000,
      received_date: '2026-08-08',
      payment_reference: 'MOMO-123',
    });

    expect(repository.amendIncomeExpectation).toHaveBeenCalledWith(incomeEntry.id, expect.objectContaining({ amount_minor: 75_000 }), 'owner@example.com');
    expect(repository.recordIncomeReceipt).toHaveBeenCalledWith(incomeEntry.id, expect.objectContaining({ amount_minor: 25_000 }), 'owner@example.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'annual_conference.finance.income_expectation_amend' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'annual_conference.finance.income_receipt_create' }));

    await expect(finance.recordIncomeReceipt(2026, incomeEntry.id, {
      amount_minor: 100_001,
      received_date: '2026-08-08',
    })).rejects.toMatchObject({ code: 'invalid' });
  });
});
