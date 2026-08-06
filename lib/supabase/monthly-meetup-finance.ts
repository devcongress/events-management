import type { Context } from 'hono';
import {
  MONTHLY_MEETUP_FINANCE_CURRENCY,
  normalizeMonthlyMeetupFinanceCategoryName,
  type MonthlyMeetupFinanceCategory,
  type MonthlyMeetupFinanceCategoryInput,
  type MonthlyMeetupFinanceExpense,
  type MonthlyMeetupFinanceExpenseInput,
  type MonthlyMeetupFinanceSnapshot,
} from '@/lib/monthly-meetup-finance';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type ExpenseRow = Database['public']['Tables']['monthly_meetup_finance_expenses']['Row'];
type ExpenseInsert = Database['public']['Tables']['monthly_meetup_finance_expenses']['Insert'];
type ExpenseUpdate = Database['public']['Tables']['monthly_meetup_finance_expenses']['Update'];
type CategoryRow = Database['public']['Tables']['monthly_meetup_finance_categories']['Row'];
type CategoryInsert = Database['public']['Tables']['monthly_meetup_finance_categories']['Insert'];

function toCategory(row: Pick<CategoryRow, 'id' | 'name'>): MonthlyMeetupFinanceCategory {
  return { id: row.id, name: row.name };
}

function toExpense(row: ExpenseRow): MonthlyMeetupFinanceExpense {
  return {
    ...row,
    amount_minor: Number(row.amount_minor),
    currency: MONTHLY_MEETUP_FINANCE_CURRENCY,
  } as MonthlyMeetupFinanceExpense;
}

export async function getSupabaseMonthlyMeetupFinance(
  event: MonthlyMeetupFinanceSnapshot['event'],
  c?: Context,
): Promise<MonthlyMeetupFinanceSnapshot | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const [categoriesResult, expensesResult] = await Promise.all([
    client
      .from('monthly_meetup_finance_categories')
      .select('id,name')
      .order('name', { ascending: true }),
    client
      .from('monthly_meetup_finance_expenses')
      .select('*')
      .eq('event_id', event.id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (expensesResult.error) throw new Error(expensesResult.error.message);
  return {
    event,
    categories: categoriesResult.data.map(toCategory),
    expenses: expensesResult.data.map(toExpense),
  };
}

export async function createSupabaseMonthlyMeetupFinanceCategory(
  input: MonthlyMeetupFinanceCategoryInput,
  actorEmail: string,
  c?: Context,
): Promise<MonthlyMeetupFinanceCategory | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const name = input.name.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeMonthlyMeetupFinanceCategoryName(name);
  const client = getSupabaseAdminClient(c);
  const existingResult = await client
    .from('monthly_meetup_finance_categories')
    .select('id,name')
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  if (existingResult.error) throw new Error(existingResult.error.message);
  if (existingResult.data) return toCategory(existingResult.data);

  const insert: CategoryInsert = {
    name,
    normalized_name: normalizedName,
    created_by_email: actorEmail,
  };
  const result = await client
    .from('monthly_meetup_finance_categories')
    .insert(insert)
    .select('id,name')
    .single();

  if (!result.error) return toCategory(result.data);
  if (result.error.code === '23505') {
    const concurrentResult = await client
      .from('monthly_meetup_finance_categories')
      .select('id,name')
      .eq('normalized_name', normalizedName)
      .single();
    if (concurrentResult.error) throw new Error(concurrentResult.error.message);
    return toCategory(concurrentResult.data);
  }
  throw new Error(result.error.message);
}

export async function createSupabaseMonthlyMeetupFinanceExpense(
  eventId: string,
  input: MonthlyMeetupFinanceExpenseInput,
  actorEmail: string,
  c?: Context,
): Promise<MonthlyMeetupFinanceExpense | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const insert: ExpenseInsert = {
    event_id: eventId,
    category: input.category,
    description: input.description,
    amount_minor: input.amount_minor,
    currency: MONTHLY_MEETUP_FINANCE_CURRENCY,
    status: input.status,
    vendor: input.vendor ?? null,
    expense_date: input.expense_date,
    notes: input.notes ?? null,
    created_by_email: actorEmail,
    updated_by_email: actorEmail,
  };
  const result = await getSupabaseAdminClient(c)
    .from('monthly_meetup_finance_expenses')
    .insert(insert)
    .select('*')
    .single();

  if (result.error) throw new Error(result.error.message);
  return toExpense(result.data);
}

export async function updateSupabaseMonthlyMeetupFinanceExpense(
  eventId: string,
  expenseId: string,
  input: MonthlyMeetupFinanceExpenseInput,
  actorEmail: string,
  c?: Context,
): Promise<MonthlyMeetupFinanceExpense | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const update: ExpenseUpdate = {
    category: input.category,
    description: input.description,
    amount_minor: input.amount_minor,
    status: input.status,
    vendor: input.vendor ?? null,
    expense_date: input.expense_date,
    notes: input.notes ?? null,
    updated_by_email: actorEmail,
  };
  const result = await getSupabaseAdminClient(c)
    .from('monthly_meetup_finance_expenses')
    .update(update)
    .eq('event_id', eventId)
    .eq('id', expenseId)
    .select('*')
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  return result.data ? toExpense(result.data) : null;
}
