import {
  ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  type AnnualConferenceFinanceBudgetLine,
  type AnnualConferenceFinanceBudgetLineInput,
  type AnnualConferenceFinanceEntry,
  type AnnualConferenceFinanceEntryInput,
  type AnnualConferenceFinanceSnapshot,
} from '@/lib/annual-conference-finance';
import { getMockAnnualConferenceWorkPlan } from '@/lib/mock-db/annual-conference-work-plan';
import { readData, updateData } from '@/lib/mock-db';
import { generateId, now } from '@/lib/utils';

const BUDGET_FILE = 'annual-conference-finance-budgets';
const ENTRY_FILE = 'annual-conference-finance-entries';

export async function getMockAnnualConferenceFinance(
  year: number,
): Promise<AnnualConferenceFinanceSnapshot | undefined> {
  const workspace = await getMockAnnualConferenceWorkPlan(year);
  if (!workspace) return undefined;
  const [budgets, entries] = await Promise.all([
    readData<AnnualConferenceFinanceBudgetLine>(BUDGET_FILE),
    readData<AnnualConferenceFinanceEntry>(ENTRY_FILE),
  ]);

  return {
    edition_id: workspace.edition.id,
    budgets: budgets
      .filter((budget) => budget.edition_id === workspace.edition.id)
      .map((budget) => ({ ...budget, currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY })),
    entries: entries
      .filter((entry) => entry.edition_id === workspace.edition.id)
      .map((entry) => ({ ...entry, currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY })),
  };
}

export async function createMockAnnualConferenceFinanceBudget(
  editionId: string,
  input: AnnualConferenceFinanceBudgetLineInput,
  actorEmail: string,
): Promise<AnnualConferenceFinanceBudgetLine> {
  return updateData<AnnualConferenceFinanceBudgetLine, AnnualConferenceFinanceBudgetLine>(
    BUDGET_FILE,
    (current) => {
      const timestamp = now();
      const budget: AnnualConferenceFinanceBudgetLine = {
        id: generateId(),
        edition_id: editionId,
        category: input.category,
        label: input.label,
        amount_minor: input.amount_minor,
        currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
        created_by_email: actorEmail,
        updated_by_email: actorEmail,
        created_at: timestamp,
        updated_at: timestamp,
      };
      return { data: [...current, budget], result: budget };
    },
  );
}

export async function createMockAnnualConferenceFinanceEntry(
  editionId: string,
  input: AnnualConferenceFinanceEntryInput,
  actorEmail: string,
): Promise<AnnualConferenceFinanceEntry> {
  return updateData<AnnualConferenceFinanceEntry, AnnualConferenceFinanceEntry>(
    ENTRY_FILE,
    (current) => {
      const timestamp = now();
      const entry: AnnualConferenceFinanceEntry = {
        id: generateId(),
        edition_id: editionId,
        kind: input.kind,
        category: input.category,
        description: input.description,
        amount_minor: input.amount_minor,
        currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
        status: input.status,
        vendor: input.vendor ?? null,
        entry_date: input.entry_date ?? null,
        notes: input.notes ?? null,
        created_by_email: actorEmail,
        updated_by_email: actorEmail,
        created_at: timestamp,
        updated_at: timestamp,
      };
      return { data: [...current, entry], result: entry };
    },
  );
}
