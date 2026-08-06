import type { Context } from 'hono';
import {
  createMockMonthlyMeetupFinanceCategory,
  createMockMonthlyMeetupFinanceExpense,
  getMockMonthlyMeetupFinance,
  updateMockMonthlyMeetupFinanceExpense,
} from '@/lib/mock-db/monthly-meetup-finance';
import {
  createSupabaseMonthlyMeetupFinanceCategory,
  createSupabaseMonthlyMeetupFinanceExpense,
  getSupabaseMonthlyMeetupFinance,
  updateSupabaseMonthlyMeetupFinanceExpense,
} from '@/lib/supabase/monthly-meetup-finance';
import type {
  MonthlyMeetupFinanceCategory,
  MonthlyMeetupFinanceCategoryInput,
  MonthlyMeetupFinanceExpense,
  MonthlyMeetupFinanceExpenseInput,
  MonthlyMeetupFinanceSnapshot,
} from '@/lib/monthly-meetup-finance';

export interface MonthlyMeetupFinanceRepository {
  getFinance(event: MonthlyMeetupFinanceSnapshot['event']): Promise<MonthlyMeetupFinanceSnapshot>;
  createCategory(
    input: MonthlyMeetupFinanceCategoryInput,
    actorEmail: string,
  ): Promise<MonthlyMeetupFinanceCategory>;
  createExpense(
    eventId: string,
    input: MonthlyMeetupFinanceExpenseInput,
    actorEmail: string,
  ): Promise<MonthlyMeetupFinanceExpense>;
  updateExpense(
    eventId: string,
    expenseId: string,
    input: MonthlyMeetupFinanceExpenseInput,
    actorEmail: string,
  ): Promise<MonthlyMeetupFinanceExpense | null>;
}

type Backend = 'supabase' | 'mock';

export function createMonthlyMeetupFinanceRepository(c?: Context): MonthlyMeetupFinanceRepository {
  let backend: Backend | null = null;

  function selectedBackend(): Backend {
    if (!backend) {
      throw new Error('Monthly meetup finance repository must load an event before mutating it.');
    }
    return backend;
  }

  return {
    async getFinance(event) {
      const finance = await getSupabaseMonthlyMeetupFinance(event, c);
      backend = finance === null ? 'mock' : 'supabase';
      return finance ?? getMockMonthlyMeetupFinance(event);
    },

    async createCategory(input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const category = await createSupabaseMonthlyMeetupFinanceCategory(input, actorEmail, c);
        if (!category) throw new Error('Supabase monthly meetup finance storage became unavailable during the request.');
        return category;
      }
      return createMockMonthlyMeetupFinanceCategory(input, actorEmail);
    },

    async createExpense(eventId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const expense = await createSupabaseMonthlyMeetupFinanceExpense(eventId, input, actorEmail, c);
        if (!expense) throw new Error('Supabase monthly meetup finance storage became unavailable during the request.');
        return expense;
      }
      return createMockMonthlyMeetupFinanceExpense(eventId, input, actorEmail);
    },

    async updateExpense(eventId, expenseId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const expense = await updateSupabaseMonthlyMeetupFinanceExpense(eventId, expenseId, input, actorEmail, c);
        if (expense === null) throw new Error('Supabase monthly meetup finance storage became unavailable during the request.');
        return expense;
      }
      return updateMockMonthlyMeetupFinanceExpense(eventId, expenseId, input, actorEmail);
    },
  };
}
