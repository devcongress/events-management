import { describe, expect, it, vi } from 'vitest';
import type { Event } from '@/types';
import {
  MONTHLY_MEETUP_FINANCE_CURRENCY,
  type MonthlyMeetupFinanceSnapshot,
} from '@/lib/monthly-meetup-finance';
import { createMonthlyMeetupFinanceService } from './monthly-meetup-finance-service';

const monthlyEvent = {
  id: 'event-1',
  name: 'August Meetup',
  event_date: '2026-08-06T18:00:00.000Z',
  series_type: 'monthly',
} as Event;

const snapshot: MonthlyMeetupFinanceSnapshot = {
  event: monthlyEvent,
  categories: [{ id: 'category-venue', name: 'Venue' }],
  expenses: [],
};

function service(role: 'owner' | 'organizer' | 'volunteer') {
  const expense = {
    id: 'expense-1',
    event_id: 'event-1',
    category: 'venue' as const,
    description: 'Venue hire',
    amount_minor: 25_000,
    currency: MONTHLY_MEETUP_FINANCE_CURRENCY,
    status: 'paid' as const,
    vendor: null,
    expense_date: '2026-08-06',
    notes: null,
    created_by_email: 'owner@example.com',
    updated_by_email: 'owner@example.com',
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
  };
  const repository = {
    getFinance: vi.fn(async () => snapshot),
    createCategory: vi.fn(async (input: { name: string }) => ({ id: 'category-custom', name: input.name })),
    createExpense: vi.fn(async () => expense),
    updateExpense: vi.fn(async () => expense),
  };
  const audit = vi.fn(async () => undefined);
  const finance = createMonthlyMeetupFinanceService({
    repository,
    actor: {
      role,
      email: role === 'owner' ? 'owner@example.com' : `${role}@example.com`,
    },
    audit,
  });
  return { finance, repository, audit };
}

describe('Monthly meetup finance service', () => {
  it('lets an Owner read and add actual expenses, and audits the mutation', async () => {
    const { finance, repository, audit } = service('owner');

    await expect(finance.getFinance(monthlyEvent)).resolves.toMatchObject({
      summary: { currency: 'GHS', actual_spend_minor: 0 },
      permissions: { can_manage: true },
    });
    await finance.createExpense(monthlyEvent, {
      category: 'venue',
      description: 'Venue hire',
      amount_minor: 25_000,
      status: 'paid',
      expense_date: '2026-08-06',
    });

    expect(repository.createExpense).toHaveBeenCalledWith('event-1', expect.anything(), 'owner@example.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'monthly_meetup.finance.expense_create',
      targetType: 'monthly_meetup_finance_expense',
    }));
  });

  it('lets an Organizer read and add actual expenses', async () => {
    const { finance, repository, audit } = service('organizer');

    await expect(finance.getFinance(monthlyEvent)).resolves.toMatchObject({
      permissions: { can_manage: true },
    });
    await finance.createExpense(monthlyEvent, {
      category: 'venue',
      description: 'Venue hire',
      amount_minor: 25_000,
      status: 'paid',
      expense_date: '2026-08-06',
    });

    expect(repository.createExpense).toHaveBeenCalledWith('event-1', expect.anything(), 'organizer@example.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'monthly_meetup.finance.expense_create',
    }));

    await finance.updateExpense(monthlyEvent, 'expense-1', {
      category: 'venue',
      description: 'Updated venue hire',
      amount_minor: 30_000,
      status: 'paid',
      expense_date: '2026-08-06',
    });
    expect(repository.updateExpense).toHaveBeenCalledWith('event-1', 'expense-1', expect.anything(), 'organizer@example.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'monthly_meetup.finance.expense_update',
    }));
  });

  it('lets Owners and Organizers add a shared monthly category', async () => {
    const { finance, repository, audit } = service('organizer');

    await expect(finance.createCategory(monthlyEvent, { name: 'Community outreach' })).resolves.toEqual({
      id: 'category-custom',
      name: 'Community outreach',
    });
    expect(repository.createCategory).toHaveBeenCalledWith({ name: 'Community outreach' }, 'organizer@example.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'monthly_meetup.finance.category_create',
      targetType: 'monthly_meetup_finance_category',
    }));
  });

  it('does not let a Volunteer read or mutate monthly finance', async () => {
    const { finance } = service('volunteer');

    await expect(finance.getFinance(monthlyEvent)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(finance.createExpense(monthlyEvent, {
      category: 'venue',
      description: 'Venue hire',
      amount_minor: 25_000,
      status: 'paid',
      expense_date: '2026-08-06',
    })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(finance.createCategory(monthlyEvent, { name: 'Community outreach' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects non-monthly events', async () => {
    const { finance } = service('owner');
    const quarterlyEvent = { ...monthlyEvent, series_type: 'quarterly' } as Event;

    await expect(finance.getFinance(quarterlyEvent)).rejects.toMatchObject({ code: 'not_monthly' });
  });
});
