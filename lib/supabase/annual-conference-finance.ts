import type { Context } from 'hono';
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
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type BudgetRow = Database['public']['Tables']['annual_conference_finance_budgets']['Row'];
type BudgetInsert = Database['public']['Tables']['annual_conference_finance_budgets']['Insert'];
type EntryRow = Database['public']['Tables']['annual_conference_finance_entries']['Row'];
type EntryInsert = Database['public']['Tables']['annual_conference_finance_entries']['Insert'];
type IncomeAmendmentRow = Database['public']['Tables']['annual_conference_finance_income_amendments']['Row'];
type IncomeReceiptRow = Database['public']['Tables']['annual_conference_finance_income_receipts']['Row'];

function toBudget(row: BudgetRow): AnnualConferenceFinanceBudgetLine {
  return {
    ...row,
    amount_minor: Number(row.amount_minor),
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  } as AnnualConferenceFinanceBudgetLine;
}

function toEntry(row: EntryRow): AnnualConferenceFinanceEntry {
  return {
    ...row,
    amount_minor: Number(row.amount_minor),
    original_amount_minor: Number(row.original_amount_minor),
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
    source_type: row.source_type as AnnualConferenceFinanceEntry['source_type'],
    source_reference: row.source_reference,
    received_amount_minor: 0,
    outstanding_amount_minor: 0,
  } as AnnualConferenceFinanceEntry;
}

function toIncomeAmendment(row: IncomeAmendmentRow): AnnualConferenceFinanceIncomeAmendment {
  return {
    ...row,
    previous_amount_minor: Number(row.previous_amount_minor),
    next_amount_minor: Number(row.next_amount_minor),
    action: row.action as AnnualConferenceFinanceIncomeAmendment['action'],
  };
}

function toIncomeReceipt(row: IncomeReceiptRow): AnnualConferenceFinanceIncomeReceipt {
  return { ...row, amount_minor: Number(row.amount_minor) };
}

export async function getSupabaseAnnualConferenceFinance(
  year: number,
  c?: Context,
): Promise<AnnualConferenceFinanceSnapshot | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const editionResult = await client
    .from('annual_conference_editions')
    .select('id')
    .eq('year', year)
    .maybeSingle();

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) return undefined;

  const [budgetResult, entryResult] = await Promise.all([
    client
      .from('annual_conference_finance_budgets')
      .select('*')
      .eq('edition_id', editionResult.data.id)
      .order('created_at', { ascending: true }),
    client
      .from('annual_conference_finance_entries')
      .select('*')
      .eq('edition_id', editionResult.data.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (budgetResult.error) throw new Error(budgetResult.error.message);
  if (entryResult.error) throw new Error(entryResult.error.message);

  const entryIds = entryResult.data.map((entry) => entry.id);
  const [amendmentResult, receiptResult] = entryIds.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }]
    : await Promise.all([
      client
        .from('annual_conference_finance_income_amendments')
        .select('*')
        .in('entry_id', entryIds)
        .order('created_at', { ascending: true }),
      client
        .from('annual_conference_finance_income_receipts')
        .select('*')
        .in('entry_id', entryIds)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
  if (amendmentResult.error) throw new Error(amendmentResult.error.message);
  if (receiptResult.error) throw new Error(receiptResult.error.message);

  const incomeReceipts = receiptResult.data.map(toIncomeReceipt);

  return {
    edition_id: editionResult.data.id,
    budgets: budgetResult.data.map(toBudget),
    entries: hydrateAnnualConferenceFinanceEntries(entryResult.data.map(toEntry), incomeReceipts),
    income_amendments: amendmentResult.data.map(toIncomeAmendment),
    income_receipts: incomeReceipts,
  };
}

export async function createSupabaseAnnualConferenceFinanceBudget(
  editionId: string,
  input: AnnualConferenceFinanceBudgetLineInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceFinanceBudgetLine | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const insert: BudgetInsert = {
    edition_id: editionId,
    category: input.category,
    label: input.label,
    amount_minor: input.amount_minor,
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
    created_by_email: actorEmail,
    updated_by_email: actorEmail,
  };
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_finance_budgets')
    .insert(insert)
    .select('*')
    .single();
  if (result.error) throw new Error(result.error.message);
  return toBudget(result.data);
}

export async function createSupabaseAnnualConferenceFinanceEntry(
  editionId: string,
  input: AnnualConferenceFinanceEntryInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceFinanceEntry | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const insert: EntryInsert = {
    edition_id: editionId,
    kind: input.kind,
    category: input.category,
    description: input.description,
    amount_minor: input.amount_minor,
    original_amount_minor: input.amount_minor,
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
    status: input.status,
    source_type: 'manual',
    vendor: input.vendor ?? null,
    entry_date: input.entry_date ?? null,
    notes: input.notes ?? null,
    created_by_email: actorEmail,
    updated_by_email: actorEmail,
  };
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_finance_entries')
    .insert(insert)
    .select('*')
    .single();
  if (result.error) throw new Error(result.error.message);
  return toEntry(result.data);
}

export async function amendSupabaseAnnualConferenceFinanceIncomeExpectation(
  entryId: string,
  input: AnnualConferenceFinanceIncomeExpectationAmendmentInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceFinanceEntry | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c).rpc('amend_annual_conference_income_expectation', {
    p_entry_id: entryId,
    p_next_amount_minor: input.amount_minor,
    p_reason: input.reason,
    p_actor_email: actorEmail,
  });
  if (result.error) throw new Error(result.error.message);
  return toEntry(result.data);
}

export async function recordSupabaseAnnualConferenceFinanceIncomeReceipt(
  entryId: string,
  input: AnnualConferenceFinanceIncomeReceiptInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceFinanceEntry | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c).rpc('record_annual_conference_income_receipt', {
    p_entry_id: entryId,
    p_amount_minor: input.amount_minor,
    p_received_date: input.received_date,
    p_payment_reference: input.payment_reference ?? null,
    p_notes: input.notes ?? null,
    p_actor_email: actorEmail,
    p_idempotency_key: input.idempotency_key,
  });
  if (result.error) throw new Error(result.error.message);
  return toEntry(result.data);
}

export async function cancelSupabaseAnnualConferenceFinanceIncomeExpectation(
  entryId: string,
  input: AnnualConferenceFinanceIncomeCancellationInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceFinanceEntry | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c).rpc('cancel_annual_conference_income_expectation', {
    p_entry_id: entryId,
    p_reason: input.reason,
    p_actor_email: actorEmail,
  });
  if (result.error) throw new Error(result.error.message);
  return toEntry(result.data);
}
