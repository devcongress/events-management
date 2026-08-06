import {
  summarizeAnnualConferenceFinance,
  type AnnualConferenceFinanceBudgetLineInput,
  type AnnualConferenceFinanceEntryInput,
} from '@/lib/annual-conference-finance';
import type { AdminRole } from '@/types/supabase';
import type { AnnualConferenceFinanceRepository } from '@/server/annual-conference-finance-repository';

export type AnnualConferenceFinanceErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'dependency_unavailable';

export class AnnualConferenceFinanceServiceError extends Error {
  constructor(readonly code: AnnualConferenceFinanceErrorCode, message: string) {
    super(message);
    this.name = 'AnnualConferenceFinanceServiceError';
  }
}

export function annualConferenceFinanceErrorStatus(
  error: AnnualConferenceFinanceServiceError,
): 403 | 404 | 500 {
  if (error.code === 'forbidden') return 403;
  if (error.code === 'not_found') return 404;
  return 500;
}

export interface AnnualConferenceFinanceServiceDependencies {
  repository: AnnualConferenceFinanceRepository;
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

export function createAnnualConferenceFinanceService(
  dependencies: AnnualConferenceFinanceServiceDependencies,
) {
  const { repository, actor } = dependencies;

  async function finance(year: number) {
    const snapshot = await repository.getFinance(year);
    if (!snapshot) {
      throw new AnnualConferenceFinanceServiceError(
        'not_found',
        'Annual conference ' + year + ' was not found.',
      );
    }
    return snapshot;
  }

  function requireOwner() {
    if (actor.role !== 'owner' || !actor.email) {
      throw new AnnualConferenceFinanceServiceError(
        'forbidden',
        'Only a platform owner can change conference finance records.',
      );
    }
    return actor.email;
  }

  return {
    async getFinance(year: number) {
      const snapshot = await finance(year);
      return {
        ...snapshot,
        summary: summarizeAnnualConferenceFinance(snapshot.budgets, snapshot.entries),
        permissions: {
          can_manage: actor.role === 'owner',
        },
      };
    },

    async createBudgetLine(year: number, input: AnnualConferenceFinanceBudgetLineInput) {
      const actorEmail = requireOwner();
      const snapshot = await finance(year);
      const budget = await repository.createBudgetLine(snapshot.edition_id, input, actorEmail);
      await dependencies.audit({
        action: 'annual_conference.finance.budget_create',
        targetType: 'annual_conference_finance_budget',
        targetId: budget.id,
        metadata: {
          edition_year: year,
          category: budget.category,
          amount_minor: budget.amount_minor,
          currency: budget.currency,
        },
      });
      return budget;
    },

    async createEntry(year: number, input: AnnualConferenceFinanceEntryInput) {
      const actorEmail = requireOwner();
      const snapshot = await finance(year);
      const entry = await repository.createEntry(snapshot.edition_id, input, actorEmail);
      await dependencies.audit({
        action: 'annual_conference.finance.entry_create',
        targetType: 'annual_conference_finance_entry',
        targetId: entry.id,
        metadata: {
          edition_year: year,
          kind: entry.kind,
          category: entry.category,
          amount_minor: entry.amount_minor,
          currency: entry.currency,
          status: entry.status,
        },
      });
      return entry;
    },
  };
}
