import {
  summarizeAnnualConferenceFinance,
  type AnnualConferenceFinanceBudgetLineInput,
  type AnnualConferenceFinanceEntryInput,
  type AnnualConferenceFinanceIncomeCancellationInput,
  type AnnualConferenceFinanceIncomeExpectationAmendmentInput,
  type AnnualConferenceFinanceIncomeReceiptInput,
} from '@/lib/annual-conference-finance';
import type { AdminRole } from '@/types/supabase';
import type { AnnualConferenceFinanceRepository } from '@/server/annual-conference-finance-repository';

export type AnnualConferenceFinanceErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'dependency_unavailable';

export class AnnualConferenceFinanceServiceError extends Error {
  constructor(readonly code: AnnualConferenceFinanceErrorCode, message: string) {
    super(message);
    this.name = 'AnnualConferenceFinanceServiceError';
  }
}

export function annualConferenceFinanceErrorStatus(
  error: AnnualConferenceFinanceServiceError,
): 400 | 403 | 404 | 500 {
  if (error.code === 'invalid') return 400;
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

  function requireManualIncomeEntry(snapshot: Awaited<ReturnType<typeof finance>>, entryId: string) {
    const entry = snapshot.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new AnnualConferenceFinanceServiceError('not_found', 'Finance income record was not found.');
    }
    if (entry.kind !== 'income' || entry.source_type !== 'manual') {
      throw new AnnualConferenceFinanceServiceError(
        'forbidden',
        'Only manual income expectations can be changed in Finance.',
      );
    }
    return entry;
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

    async amendIncomeExpectation(
      year: number,
      entryId: string,
      input: AnnualConferenceFinanceIncomeExpectationAmendmentInput,
    ) {
      const actorEmail = requireOwner();
      const snapshot = await finance(year);
      const entry = requireManualIncomeEntry(snapshot, entryId);
      if (entry.status === 'cancelled') {
        throw new AnnualConferenceFinanceServiceError('invalid', 'A cancelled expectation cannot be amended.');
      }
      if (input.amount_minor < entry.received_amount_minor) {
        throw new AnnualConferenceFinanceServiceError(
          'invalid',
          'The revised expected amount cannot be lower than money already received.',
        );
      }
      const updated = await repository.amendIncomeExpectation(entry.id, input, actorEmail);
      await dependencies.audit({
        action: 'annual_conference.finance.income_expectation_amend',
        targetType: 'annual_conference_finance_entry',
        targetId: entry.id,
        metadata: {
          edition_year: year,
          previous_amount_minor: entry.amount_minor,
          next_amount_minor: input.amount_minor,
          reason: input.reason,
          currency: updated.currency,
        },
      });
      return updated;
    },

    async recordIncomeReceipt(
      year: number,
      entryId: string,
      input: AnnualConferenceFinanceIncomeReceiptInput,
    ) {
      const actorEmail = requireOwner();
      const snapshot = await finance(year);
      const entry = requireManualIncomeEntry(snapshot, entryId);
      if (entry.status === 'cancelled') {
        throw new AnnualConferenceFinanceServiceError('invalid', 'A cancelled expectation cannot receive a payment.');
      }
      if (entry.outstanding_amount_minor <= 0) {
        throw new AnnualConferenceFinanceServiceError('invalid', 'This income expectation has no outstanding amount.');
      }
      if (input.amount_minor > entry.outstanding_amount_minor) {
        throw new AnnualConferenceFinanceServiceError(
          'invalid',
          'This payment is higher than the outstanding expected amount.',
        );
      }
      const updated = await repository.recordIncomeReceipt(entry.id, input, actorEmail);
      await dependencies.audit({
        action: 'annual_conference.finance.income_receipt_create',
        targetType: 'annual_conference_finance_entry',
        targetId: entry.id,
        metadata: {
          edition_year: year,
          amount_minor: input.amount_minor,
          received_date: input.received_date,
          payment_reference: input.payment_reference ?? null,
          currency: updated.currency,
        },
      });
      return updated;
    },

    async cancelIncomeExpectation(
      year: number,
      entryId: string,
      input: AnnualConferenceFinanceIncomeCancellationInput,
    ) {
      const actorEmail = requireOwner();
      const snapshot = await finance(year);
      const entry = requireManualIncomeEntry(snapshot, entryId);
      if (entry.status === 'cancelled') {
        throw new AnnualConferenceFinanceServiceError('invalid', 'This expectation has already been cancelled.');
      }
      if (entry.received_amount_minor > 0) {
        throw new AnnualConferenceFinanceServiceError(
          'invalid',
          'An expectation with money received cannot be cancelled.',
        );
      }
      const updated = await repository.cancelIncomeExpectation(entry.id, input, actorEmail);
      await dependencies.audit({
        action: 'annual_conference.finance.income_expectation_cancel',
        targetType: 'annual_conference_finance_entry',
        targetId: entry.id,
        metadata: {
          edition_year: year,
          previous_amount_minor: entry.amount_minor,
          reason: input.reason,
          currency: updated.currency,
        },
      });
      return updated;
    },
  };
}
