import {
  ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  hydrateAnnualConferenceFinanceEntries,
  type AnnualConferenceFinanceBudgetLine,
  type AnnualConferenceFinanceBudgetLineInput,
  type AnnualConferenceFinanceEntry,
  type AnnualConferenceFinanceEntryInput,
  type AnnualConferenceFinanceIncomeAmendment,
  type AnnualConferenceFinanceIncomeCancellationInput,
  type AnnualConferenceFinanceIncomeExpectationAmendmentInput,
  type AnnualConferenceFinanceIncomeReceipt,
  type AnnualConferenceFinanceIncomeReceiptInput,
  type AnnualConferenceFinanceSnapshot,
} from '@/lib/annual-conference-finance';
import { getMockAnnualConferenceWorkPlan } from '@/lib/mock-db/annual-conference-work-plan';
import { readData, updateData } from '@/lib/mock-db';
import { generateId, now } from '@/lib/utils';

const BUDGET_FILE = 'annual-conference-finance-budgets';
const ENTRY_FILE = 'annual-conference-finance-entries';
const INCOME_AMENDMENT_FILE = 'annual-conference-finance-income-amendments';
const INCOME_RECEIPT_FILE = 'annual-conference-finance-income-receipts';

export async function getMockAnnualConferenceFinance(
  year: number,
): Promise<AnnualConferenceFinanceSnapshot | undefined> {
  const workspace = await getMockAnnualConferenceWorkPlan(year);
  if (!workspace) return undefined;
  const [budgets, entries, incomeAmendments, incomeReceipts] = await Promise.all([
    readData<AnnualConferenceFinanceBudgetLine>(BUDGET_FILE),
    readData<AnnualConferenceFinanceEntry>(ENTRY_FILE),
    readData<AnnualConferenceFinanceIncomeAmendment>(INCOME_AMENDMENT_FILE),
    readData<AnnualConferenceFinanceIncomeReceipt>(INCOME_RECEIPT_FILE),
  ]);

  const editionEntries = entries
    .filter((entry) => entry.edition_id === workspace.edition.id)
    .map((entry) => ({
      ...entry,
      currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
      original_amount_minor: entry.original_amount_minor ?? entry.amount_minor,
      source_type: entry.source_type ?? 'manual',
      source_reference: entry.source_reference ?? null,
      received_amount_minor: entry.received_amount_minor ?? 0,
      outstanding_amount_minor: entry.outstanding_amount_minor ?? 0,
    }));
  const relevantEntryIds = new Set(editionEntries.map((entry) => entry.id));
  const relevantReceipts = incomeReceipts.filter((receipt) => relevantEntryIds.has(receipt.entry_id));

  return {
    edition_id: workspace.edition.id,
    budgets: budgets
      .filter((budget) => budget.edition_id === workspace.edition.id)
      .map((budget) => ({ ...budget, currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY })),
    entries: hydrateAnnualConferenceFinanceEntries(editionEntries, relevantReceipts),
    income_amendments: incomeAmendments.filter((amendment) => relevantEntryIds.has(amendment.entry_id)),
    income_receipts: relevantReceipts,
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
        original_amount_minor: input.amount_minor,
        currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
        status: input.status,
        source_type: 'manual',
        source_reference: null,
        received_amount_minor: input.kind === 'income' && input.status === 'received' ? input.amount_minor : 0,
        outstanding_amount_minor: 0,
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

export async function amendMockAnnualConferenceFinanceIncomeExpectation(
  entryId: string,
  input: AnnualConferenceFinanceIncomeExpectationAmendmentInput,
  actorEmail: string,
): Promise<AnnualConferenceFinanceEntry> {
  const receipts = await readData<AnnualConferenceFinanceIncomeReceipt>(INCOME_RECEIPT_FILE);
  const received = receipts.filter((receipt) => receipt.entry_id === entryId)
    .reduce((total, receipt) => total + receipt.amount_minor, 0);
  return updateData<AnnualConferenceFinanceEntry, AnnualConferenceFinanceEntry>(ENTRY_FILE, async (current) => {
    const entry = current.find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error('Finance income record was not found.');
    if (entry.kind !== 'income' || (entry.source_type ?? 'manual') !== 'manual') throw new Error('Only manual income expectations can be amended here.');
    if (entry.status === 'cancelled') throw new Error('A cancelled expectation cannot be amended.');
    const legacyReceived = entry.status === 'received' && received === 0 ? entry.amount_minor : received;
    if (input.amount_minor < legacyReceived) throw new Error('The revised expected amount cannot be lower than money already received.');
    const timestamp = now();
    const status = legacyReceived === 0 ? 'expected' : legacyReceived < input.amount_minor ? 'partially_received' : 'received';
    const updated = { ...entry, amount_minor: input.amount_minor, status, updated_by_email: actorEmail, updated_at: timestamp } as AnnualConferenceFinanceEntry;
    await updateData<AnnualConferenceFinanceIncomeAmendment, void>(INCOME_AMENDMENT_FILE, (amendments) => ({
      data: [...amendments, {
        id: generateId(), entry_id: entryId, previous_amount_minor: entry.amount_minor, next_amount_minor: input.amount_minor,
        action: 'amend', reason: input.reason, created_by_email: actorEmail, created_at: timestamp,
      }],
      result: undefined,
    }));
    return { data: current.map((candidate) => candidate.id === entryId ? updated : candidate), result: updated };
  });
}

export async function recordMockAnnualConferenceFinanceIncomeReceipt(
  entryId: string,
  input: AnnualConferenceFinanceIncomeReceiptInput,
  actorEmail: string,
): Promise<AnnualConferenceFinanceEntry> {
  const receipts = await readData<AnnualConferenceFinanceIncomeReceipt>(INCOME_RECEIPT_FILE);
  const existingReceived = receipts.filter((receipt) => receipt.entry_id === entryId)
    .reduce((total, receipt) => total + receipt.amount_minor, 0);
  return updateData<AnnualConferenceFinanceEntry, AnnualConferenceFinanceEntry>(ENTRY_FILE, async (current) => {
    const entry = current.find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error('Finance income record was not found.');
    if (entry.kind !== 'income' || (entry.source_type ?? 'manual') !== 'manual') throw new Error('Only manual income expectations can receive payments here.');
    if (entry.status === 'cancelled') throw new Error('A cancelled expectation cannot receive a payment.');
    if (entry.status === 'received' && existingReceived === 0) throw new Error('This income record was marked received when it was created and cannot accept another receipt.');
    if (existingReceived + input.amount_minor > entry.amount_minor) throw new Error('This payment is higher than the outstanding expected amount.');
    const timestamp = now();
    const nextReceived = existingReceived + input.amount_minor;
    const updated = {
      ...entry,
      status: nextReceived < entry.amount_minor ? 'partially_received' : 'received',
      updated_by_email: actorEmail,
      updated_at: timestamp,
    } as AnnualConferenceFinanceEntry;
    await updateData<AnnualConferenceFinanceIncomeReceipt, void>(INCOME_RECEIPT_FILE, (currentReceipts) => ({
      data: [...currentReceipts, {
        id: generateId(), entry_id: entryId, amount_minor: input.amount_minor, received_date: input.received_date,
        payment_reference: input.payment_reference ?? null, notes: input.notes ?? null, created_by_email: actorEmail, created_at: timestamp,
      }],
      result: undefined,
    }));
    return { data: current.map((candidate) => candidate.id === entryId ? updated : candidate), result: updated };
  });
}

export async function cancelMockAnnualConferenceFinanceIncomeExpectation(
  entryId: string,
  input: AnnualConferenceFinanceIncomeCancellationInput,
  actorEmail: string,
): Promise<AnnualConferenceFinanceEntry> {
  const receipts = await readData<AnnualConferenceFinanceIncomeReceipt>(INCOME_RECEIPT_FILE);
  const received = receipts.filter((receipt) => receipt.entry_id === entryId)
    .reduce((total, receipt) => total + receipt.amount_minor, 0);
  return updateData<AnnualConferenceFinanceEntry, AnnualConferenceFinanceEntry>(ENTRY_FILE, async (current) => {
    const entry = current.find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error('Finance income record was not found.');
    if (entry.kind !== 'income' || (entry.source_type ?? 'manual') !== 'manual') throw new Error('Only manual income expectations can be cancelled here.');
    if (entry.status === 'cancelled') throw new Error('This expectation has already been cancelled.');
    const legacyReceived = entry.status === 'received' && received === 0 ? entry.amount_minor : received;
    if (legacyReceived > 0) throw new Error('An expectation with money received cannot be cancelled.');
    const timestamp = now();
    const updated = { ...entry, status: 'cancelled', updated_by_email: actorEmail, updated_at: timestamp } as AnnualConferenceFinanceEntry;
    await updateData<AnnualConferenceFinanceIncomeAmendment, void>(INCOME_AMENDMENT_FILE, (amendments) => ({
      data: [...amendments, {
        id: generateId(), entry_id: entryId, previous_amount_minor: entry.amount_minor, next_amount_minor: 0,
        action: 'cancel', reason: input.reason, created_by_email: actorEmail, created_at: timestamp,
      }],
      result: undefined,
    }));
    return { data: current.map((candidate) => candidate.id === entryId ? updated : candidate), result: updated };
  });
}
