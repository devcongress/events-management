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
};

function service(role: 'owner' | 'organizer') {
  const repository = {
    getFinance: vi.fn(async () => snapshot),
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
      currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
      status: 'committed' as const,
      vendor: null,
      entry_date: null,
      notes: null,
      created_by_email: 'owner@example.com',
      updated_by_email: 'owner@example.com',
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
    })),
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
  });
});
