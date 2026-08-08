export const ANNUAL_CONFERENCE_FINANCE_CURRENCY = 'GHS' as const;

export const ANNUAL_CONFERENCE_FINANCE_ENTRY_KINDS = ['expense', 'income'] as const;
export type AnnualConferenceFinanceEntryKind = typeof ANNUAL_CONFERENCE_FINANCE_ENTRY_KINDS[number];

export const ANNUAL_CONFERENCE_FINANCE_EXPENSE_STATUSES = ['draft', 'committed', 'paid', 'cancelled'] as const;
export type AnnualConferenceFinanceExpenseStatus = typeof ANNUAL_CONFERENCE_FINANCE_EXPENSE_STATUSES[number];

export const ANNUAL_CONFERENCE_FINANCE_INCOME_STATUSES = ['expected', 'received', 'cancelled'] as const;
export type AnnualConferenceFinanceIncomeStatus = typeof ANNUAL_CONFERENCE_FINANCE_INCOME_STATUSES[number];

export const ANNUAL_CONFERENCE_FINANCE_INCOME_LIFECYCLE_STATUSES = [
  'expected',
  'partially_received',
  'received',
  'cancelled',
] as const;
export type AnnualConferenceFinanceIncomeLifecycleStatus = typeof ANNUAL_CONFERENCE_FINANCE_INCOME_LIFECYCLE_STATUSES[number];

export const ANNUAL_CONFERENCE_FINANCE_INCOME_SOURCES = ['manual', 'sponsor', 'ticket'] as const;
export type AnnualConferenceFinanceIncomeSource = typeof ANNUAL_CONFERENCE_FINANCE_INCOME_SOURCES[number];

export type AnnualConferenceFinanceEntryStatus =
  | AnnualConferenceFinanceExpenseStatus
  | AnnualConferenceFinanceIncomeLifecycleStatus;

export const ANNUAL_CONFERENCE_FINANCE_CATEGORIES = [
  'venue',
  'catering',
  'av_connectivity',
  'creative_printing',
  'media',
  'badges',
  'signage',
  'swag',
  'transport',
  'speaker_support',
  'contingency',
  'other',
] as const;
export type AnnualConferenceFinanceCategory = typeof ANNUAL_CONFERENCE_FINANCE_CATEGORIES[number];

export const ANNUAL_CONFERENCE_FINANCE_CATEGORY_LABELS: Record<AnnualConferenceFinanceCategory, string> = {
  venue: 'Venue',
  catering: 'Catering',
  av_connectivity: 'AV and connectivity',
  creative_printing: 'Creative and printing',
  media: 'Media',
  badges: 'Badges',
  signage: 'Signage',
  swag: 'Swag',
  transport: 'Transport',
  speaker_support: 'Speaker support',
  contingency: 'Contingency',
  other: 'Other',
};

export interface AnnualConferenceFinanceBudgetLine {
  id: string;
  edition_id: string;
  category: AnnualConferenceFinanceCategory;
  label: string;
  amount_minor: number;
  currency: typeof ANNUAL_CONFERENCE_FINANCE_CURRENCY;
  created_by_email: string | null;
  updated_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceFinanceBudgetLineInput {
  category: AnnualConferenceFinanceCategory;
  label: string;
  amount_minor: number;
}

export interface AnnualConferenceFinanceEntry {
  id: string;
  edition_id: string;
  kind: AnnualConferenceFinanceEntryKind;
  category: AnnualConferenceFinanceCategory;
  description: string;
  amount_minor: number;
  original_amount_minor: number;
  currency: typeof ANNUAL_CONFERENCE_FINANCE_CURRENCY;
  status: AnnualConferenceFinanceEntryStatus;
  source_type: AnnualConferenceFinanceIncomeSource;
  source_reference: string | null;
  received_amount_minor: number;
  outstanding_amount_minor: number;
  vendor: string | null;
  entry_date: string | null;
  notes: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceFinanceEntryInput {
  kind: AnnualConferenceFinanceEntryKind;
  category: AnnualConferenceFinanceCategory;
  description: string;
  amount_minor: number;
  status: AnnualConferenceFinanceEntryStatus;
  vendor?: string | null;
  entry_date?: string | null;
  notes?: string | null;
}

export interface AnnualConferenceFinanceIncomeAmendment {
  id: string;
  entry_id: string;
  previous_amount_minor: number;
  next_amount_minor: number;
  action: 'amend' | 'cancel';
  reason: string;
  created_by_email: string | null;
  created_at: string;
}

export interface AnnualConferenceFinanceIncomeReceipt {
  id: string;
  entry_id: string;
  amount_minor: number;
  received_date: string;
  payment_reference: string | null;
  notes: string | null;
  created_by_email: string | null;
  created_at: string;
}

export interface AnnualConferenceFinanceIncomeExpectationAmendmentInput {
  amount_minor: number;
  reason: string;
}

export interface AnnualConferenceFinanceIncomeReceiptInput {
  amount_minor: number;
  received_date: string;
  payment_reference?: string | null;
  notes?: string | null;
}

export interface AnnualConferenceFinanceIncomeCancellationInput {
  reason: string;
}

export interface AnnualConferenceFinanceCategorySummary {
  category: AnnualConferenceFinanceCategory;
  planned_minor: number;
  committed_minor: number;
  paid_minor: number;
  variance_minor: number;
}

export interface AnnualConferenceFinanceSummary {
  currency: typeof ANNUAL_CONFERENCE_FINANCE_CURRENCY;
  planned_budget_minor: number;
  committed_minor: number;
  paid_minor: number;
  remaining_minor: number;
  unpaid_committed_minor: number;
  income_expected_minor: number;
  income_received_minor: number;
  net_cash_minor: number;
  by_category: AnnualConferenceFinanceCategorySummary[];
}

export interface AnnualConferenceFinanceSnapshot {
  edition_id: string;
  budgets: AnnualConferenceFinanceBudgetLine[];
  entries: AnnualConferenceFinanceEntry[];
  income_amendments: AnnualConferenceFinanceIncomeAmendment[];
  income_receipts: AnnualConferenceFinanceIncomeReceipt[];
}

export function hydrateAnnualConferenceFinanceEntries(
  entries: readonly AnnualConferenceFinanceEntry[],
  receipts: readonly AnnualConferenceFinanceIncomeReceipt[],
): AnnualConferenceFinanceEntry[] {
  const receiptsByEntry = new Map<string, number>();
  for (const receipt of receipts) {
    receiptsByEntry.set(receipt.entry_id, (receiptsByEntry.get(receipt.entry_id) ?? 0) + receipt.amount_minor);
  }

  return entries.map((entry) => {
    if (entry.kind !== 'income') {
      return { ...entry, received_amount_minor: 0, outstanding_amount_minor: 0 };
    }
    const receiptTotal = receiptsByEntry.get(entry.id) ?? 0;
    const received = receiptTotal || (entry.status === 'received' ? entry.amount_minor : 0);
    return {
      ...entry,
      received_amount_minor: received,
      outstanding_amount_minor: entry.status === 'cancelled' ? 0 : Math.max(entry.amount_minor - received, 0),
    };
  });
}

export function summarizeAnnualConferenceFinance(
  budgets: readonly AnnualConferenceFinanceBudgetLine[],
  entries: readonly AnnualConferenceFinanceEntry[],
): AnnualConferenceFinanceSummary {
  const categorySummary = new Map<AnnualConferenceFinanceCategory, AnnualConferenceFinanceCategorySummary>(
    ANNUAL_CONFERENCE_FINANCE_CATEGORIES.map((category) => [category, {
      category,
      planned_minor: 0,
      committed_minor: 0,
      paid_minor: 0,
      variance_minor: 0,
    }]),
  );

  let plannedBudget = 0;
  let committed = 0;
  let paid = 0;
  let incomeExpected = 0;
  let incomeReceived = 0;

  for (const budget of budgets) {
    plannedBudget += budget.amount_minor;
    const category = categorySummary.get(budget.category);
    if (category) category.planned_minor += budget.amount_minor;
  }

  for (const entry of entries) {
    if (entry.kind === 'income') {
      const received = entry.received_amount_minor || (entry.status === 'received' ? entry.amount_minor : 0);
      const outstanding = entry.status === 'cancelled'
        ? 0
        : entry.outstanding_amount_minor || Math.max(entry.amount_minor - received, 0);
      incomeExpected += outstanding;
      incomeReceived += received;
      continue;
    }

    if (entry.status === 'committed' || entry.status === 'paid') {
      committed += entry.amount_minor;
      const category = categorySummary.get(entry.category);
      if (category) category.committed_minor += entry.amount_minor;
    }
    if (entry.status === 'paid') {
      paid += entry.amount_minor;
      const category = categorySummary.get(entry.category);
      if (category) category.paid_minor += entry.amount_minor;
    }
  }

  const byCategory = [...categorySummary.values()]
    .map((category) => ({
      ...category,
      variance_minor: category.planned_minor - category.committed_minor,
    }))
    .filter((category) => (
      category.planned_minor > 0
      || category.committed_minor > 0
      || category.paid_minor > 0
    ));

  return {
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
    planned_budget_minor: plannedBudget,
    committed_minor: committed,
    paid_minor: paid,
    remaining_minor: plannedBudget - committed,
    unpaid_committed_minor: committed - paid,
    income_expected_minor: incomeExpected,
    income_received_minor: incomeReceived,
    net_cash_minor: incomeReceived - paid,
    by_category: byCategory,
  };
}
