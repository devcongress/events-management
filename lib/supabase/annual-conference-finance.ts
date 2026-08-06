import type { Context } from 'hono';
import {
  ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  type AnnualConferenceFinanceBudgetLine,
  type AnnualConferenceFinanceBudgetLineInput,
  type AnnualConferenceFinanceEntry,
  type AnnualConferenceFinanceEntryInput,
  type AnnualConferenceFinanceSnapshot,
} from '@/lib/annual-conference-finance';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type BudgetRow = Database['public']['Tables']['annual_conference_finance_budgets']['Row'];
type BudgetInsert = Database['public']['Tables']['annual_conference_finance_budgets']['Insert'];
type EntryRow = Database['public']['Tables']['annual_conference_finance_entries']['Row'];
type EntryInsert = Database['public']['Tables']['annual_conference_finance_entries']['Insert'];

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
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
  } as AnnualConferenceFinanceEntry;
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

  return {
    edition_id: editionResult.data.id,
    budgets: budgetResult.data.map(toBudget),
    entries: entryResult.data.map(toEntry),
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
    currency: ANNUAL_CONFERENCE_FINANCE_CURRENCY,
    status: input.status,
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
