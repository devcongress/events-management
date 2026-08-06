import { resolveEventSeriesType } from '@/lib/event-series';
import {
  summarizeMonthlyMeetupFinance,
  normalizeMonthlyMeetupFinanceCategoryName,
  type MonthlyMeetupFinanceCategoryInput,
  type MonthlyMeetupFinanceExpenseInput,
} from '@/lib/monthly-meetup-finance';
import type { AdminRole } from '@/types/supabase';
import type { Event } from '@/types';
import type { MonthlyMeetupFinanceRepository } from '@/server/monthly-meetup-finance-repository';

export type MonthlyMeetupFinanceErrorCode = 'forbidden' | 'not_found' | 'not_monthly' | 'invalid_category' | 'dependency_unavailable';

export class MonthlyMeetupFinanceServiceError extends Error {
  constructor(readonly code: MonthlyMeetupFinanceErrorCode, message: string) {
    super(message);
    this.name = 'MonthlyMeetupFinanceServiceError';
  }
}

export function monthlyMeetupFinanceErrorStatus(
  error: MonthlyMeetupFinanceServiceError,
): 400 | 403 | 404 | 422 | 500 {
  if (error.code === 'forbidden') return 403;
  if (error.code === 'not_found') return 404;
  if (error.code === 'not_monthly') return 422;
  if (error.code === 'invalid_category') return 400;
  return 500;
}

export interface MonthlyMeetupFinanceServiceDependencies {
  repository: MonthlyMeetupFinanceRepository;
  actor: {
    email: string | null;
    role: AdminRole;
  };
  audit(event: {
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export function createMonthlyMeetupFinanceService(
  dependencies: MonthlyMeetupFinanceServiceDependencies,
) {
  const { repository, actor } = dependencies;

  function requireViewer(): void {
    if (actor.role !== 'owner' && actor.role !== 'organizer') {
      throw new MonthlyMeetupFinanceServiceError(
        'forbidden',
        'This account does not have monthly meetup finance access.',
      );
    }
  }

  function requireEditor(): string {
    if ((actor.role !== 'owner' && actor.role !== 'organizer') || !actor.email) {
      throw new MonthlyMeetupFinanceServiceError(
        'forbidden',
        'Only Owners and Organizers can change monthly meetup finance records.',
      );
    }
    return actor.email;
  }

  function requireMonthlyEvent(event: Event): void {
    if (resolveEventSeriesType(event) !== 'monthly') {
      throw new MonthlyMeetupFinanceServiceError(
        'not_monthly',
        'Finance tracking is only available for monthly meetups.',
      );
    }
  }

  function canonicalCategory(
    categories: readonly { name: string }[],
    categoryName: string,
  ): string {
    const normalizedName = normalizeMonthlyMeetupFinanceCategoryName(categoryName);
    const category = categories.find(
      (candidate) => normalizeMonthlyMeetupFinanceCategoryName(candidate.name) === normalizedName,
    );
    if (!category) {
      throw new MonthlyMeetupFinanceServiceError(
        'invalid_category',
        'Choose an existing monthly category or add a new one first.',
      );
    }
    return category.name;
  }

  return {
    async getFinance(event: Event) {
      requireViewer();
      requireMonthlyEvent(event);
      const snapshot = await repository.getFinance(event);
      return {
        ...snapshot,
        summary: summarizeMonthlyMeetupFinance(snapshot.expenses, snapshot.categories),
        permissions: { can_manage: actor.role === 'owner' || actor.role === 'organizer' },
      };
    },

    async createCategory(event: Event, input: MonthlyMeetupFinanceCategoryInput) {
      const actorEmail = requireEditor();
      requireMonthlyEvent(event);
      await repository.getFinance(event);
      const category = await repository.createCategory(input, actorEmail);
      await dependencies.audit({
        action: 'monthly_meetup.finance.category_create',
        targetType: 'monthly_meetup_finance_category',
        targetId: category.id,
        metadata: { event_id: event.id, category: category.name },
      });
      return category;
    },

    async createExpense(event: Event, input: MonthlyMeetupFinanceExpenseInput) {
      const actorEmail = requireEditor();
      requireMonthlyEvent(event);
      const snapshot = await repository.getFinance(event);
      const expense = await repository.createExpense(
        event.id,
        { ...input, category: canonicalCategory(snapshot.categories, input.category) },
        actorEmail,
      );
      await dependencies.audit({
        action: 'monthly_meetup.finance.expense_create',
        targetType: 'monthly_meetup_finance_expense',
        targetId: expense.id,
        metadata: {
          event_id: event.id,
          category: expense.category,
          amount_minor: expense.amount_minor,
          currency: expense.currency,
          status: expense.status,
          expense_date: expense.expense_date,
        },
      });
      return expense;
    },

    async updateExpense(event: Event, expenseId: string, input: MonthlyMeetupFinanceExpenseInput) {
      const actorEmail = requireEditor();
      requireMonthlyEvent(event);
      const snapshot = await repository.getFinance(event);
      const expense = await repository.updateExpense(
        event.id,
        expenseId,
        { ...input, category: canonicalCategory(snapshot.categories, input.category) },
        actorEmail,
      );
      if (!expense) {
        throw new MonthlyMeetupFinanceServiceError('not_found', 'Monthly expense not found.');
      }
      await dependencies.audit({
        action: 'monthly_meetup.finance.expense_update',
        targetType: 'monthly_meetup_finance_expense',
        targetId: expense.id,
        metadata: {
          event_id: event.id,
          category: expense.category,
          amount_minor: expense.amount_minor,
          currency: expense.currency,
          status: expense.status,
          expense_date: expense.expense_date,
        },
      });
      return expense;
    },
  };
}
