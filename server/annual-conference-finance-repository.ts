import type { Context } from 'hono';
import {
  createMockAnnualConferenceFinanceBudget,
  createMockAnnualConferenceFinanceEntry,
  getMockAnnualConferenceFinance,
} from '@/lib/mock-db/annual-conference-finance';
import {
  createSupabaseAnnualConferenceFinanceBudget,
  createSupabaseAnnualConferenceFinanceEntry,
  getSupabaseAnnualConferenceFinance,
} from '@/lib/supabase/annual-conference-finance';
import type {
  AnnualConferenceFinanceBudgetLine,
  AnnualConferenceFinanceBudgetLineInput,
  AnnualConferenceFinanceEntry,
  AnnualConferenceFinanceEntryInput,
  AnnualConferenceFinanceSnapshot,
} from '@/lib/annual-conference-finance';

export interface AnnualConferenceFinanceRepository {
  getFinance(year: number): Promise<AnnualConferenceFinanceSnapshot | undefined>;
  createBudgetLine(
    editionId: string,
    input: AnnualConferenceFinanceBudgetLineInput,
    actorEmail: string,
  ): Promise<AnnualConferenceFinanceBudgetLine>;
  createEntry(
    editionId: string,
    input: AnnualConferenceFinanceEntryInput,
    actorEmail: string,
  ): Promise<AnnualConferenceFinanceEntry>;
}

type Backend = 'supabase' | 'mock';

export function createAnnualConferenceFinanceRepository(c?: Context): AnnualConferenceFinanceRepository {
  let backend: Backend | null = null;

  function selectedBackend(): Backend {
    if (!backend) {
      throw new Error('Annual Conference finance repository must load an edition before mutating it.');
    }
    return backend;
  }

  return {
    async getFinance(year) {
      const finance = await getSupabaseAnnualConferenceFinance(year, c);
      backend = finance === null ? 'mock' : 'supabase';
      return finance === null ? getMockAnnualConferenceFinance(year) : finance;
    },

    async createBudgetLine(editionId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const budget = await createSupabaseAnnualConferenceFinanceBudget(editionId, input, actorEmail, c);
        if (!budget) throw new Error('Supabase Annual Conference finance storage became unavailable during the request.');
        return budget;
      }
      return createMockAnnualConferenceFinanceBudget(editionId, input, actorEmail);
    },

    async createEntry(editionId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const entry = await createSupabaseAnnualConferenceFinanceEntry(editionId, input, actorEmail, c);
        if (!entry) throw new Error('Supabase Annual Conference finance storage became unavailable during the request.');
        return entry;
      }
      return createMockAnnualConferenceFinanceEntry(editionId, input, actorEmail);
    },
  };
}
