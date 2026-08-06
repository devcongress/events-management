import {
  MONTHLY_MEETUP_FINANCE_DEFAULT_CATEGORY_NAMES,
  MONTHLY_MEETUP_FINANCE_CURRENCY,
  normalizeMonthlyMeetupFinanceCategoryName,
  type MonthlyMeetupFinanceCategory,
  type MonthlyMeetupFinanceCategoryInput,
  type MonthlyMeetupFinanceExpense,
  type MonthlyMeetupFinanceExpenseInput,
  type MonthlyMeetupFinanceSnapshot,
} from '@/lib/monthly-meetup-finance';
import { readData, updateData } from '@/lib/mock-db';
import { generateId, now } from '@/lib/utils';

const EXPENSE_FILE = 'monthly-meetup-finance-expenses';
const CATEGORY_FILE = 'monthly-meetup-finance-categories';

function categoryId(name: string): string {
  return `monthly-category-${normalizeMonthlyMeetupFinanceCategoryName(name).replace(/[^a-z0-9]+/g, '-')}`;
}

function mergeCategories(
  savedCategories: MonthlyMeetupFinanceCategory[],
  expenses: MonthlyMeetupFinanceExpense[],
): MonthlyMeetupFinanceCategory[] {
  const categories = new Map<string, MonthlyMeetupFinanceCategory>();
  for (const name of MONTHLY_MEETUP_FINANCE_DEFAULT_CATEGORY_NAMES) {
    categories.set(normalizeMonthlyMeetupFinanceCategoryName(name), {
      id: categoryId(name),
      name,
    });
  }
  for (const category of savedCategories) {
    categories.set(normalizeMonthlyMeetupFinanceCategoryName(category.name), category);
  }
  for (const expense of expenses) {
    const normalizedName = normalizeMonthlyMeetupFinanceCategoryName(expense.category);
    if (!categories.has(normalizedName)) {
      categories.set(normalizedName, {
        id: categoryId(expense.category),
        name: expense.category.trim(),
      });
    }
  }
  return [...categories.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function getMockMonthlyMeetupFinance(
  event: MonthlyMeetupFinanceSnapshot['event'],
): Promise<MonthlyMeetupFinanceSnapshot> {
  const expenses = await readData<MonthlyMeetupFinanceExpense>(EXPENSE_FILE);
  const savedCategories = await readData<MonthlyMeetupFinanceCategory>(CATEGORY_FILE);
  return {
    event,
    categories: mergeCategories(savedCategories, expenses),
    expenses: expenses
      .filter((expense) => expense.event_id === event.id)
      .map((expense) => ({ ...expense, currency: MONTHLY_MEETUP_FINANCE_CURRENCY })),
  };
}

export async function createMockMonthlyMeetupFinanceCategory(
  input: MonthlyMeetupFinanceCategoryInput,
  actorEmail: string,
): Promise<MonthlyMeetupFinanceCategory> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeMonthlyMeetupFinanceCategoryName(name);
  const defaultCategory = MONTHLY_MEETUP_FINANCE_DEFAULT_CATEGORY_NAMES.find(
    (defaultName) => normalizeMonthlyMeetupFinanceCategoryName(defaultName) === normalizedName,
  );
  if (defaultCategory) {
    return { id: categoryId(defaultCategory), name: defaultCategory };
  }

  return updateData<MonthlyMeetupFinanceCategory, MonthlyMeetupFinanceCategory>(
    CATEGORY_FILE,
    (current) => {
      const existing = current.find(
        (category) => normalizeMonthlyMeetupFinanceCategoryName(category.name) === normalizedName,
      );
      if (existing) return { data: current, result: existing };

      const category = { id: generateId(), name };
      // Keep the actor in the write path so the local adapter mirrors the
      // server-side audit contract even though the category model stores only
      // its shared display name.
      void actorEmail;
      return { data: [...current, category], result: category };
    },
  );
}

export async function createMockMonthlyMeetupFinanceExpense(
  eventId: string,
  input: MonthlyMeetupFinanceExpenseInput,
  actorEmail: string,
): Promise<MonthlyMeetupFinanceExpense> {
  return updateData<MonthlyMeetupFinanceExpense, MonthlyMeetupFinanceExpense>(
    EXPENSE_FILE,
    (current) => {
      const timestamp = now();
      const expense: MonthlyMeetupFinanceExpense = {
        id: generateId(),
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
        created_at: timestamp,
        updated_at: timestamp,
      };
      return { data: [...current, expense], result: expense };
    },
  );
}

export async function updateMockMonthlyMeetupFinanceExpense(
  eventId: string,
  expenseId: string,
  input: MonthlyMeetupFinanceExpenseInput,
  actorEmail: string,
): Promise<MonthlyMeetupFinanceExpense | null> {
  return updateData<MonthlyMeetupFinanceExpense, MonthlyMeetupFinanceExpense | null>(
    EXPENSE_FILE,
    (current) => {
      const existing = current.find((expense) => expense.id === expenseId && expense.event_id === eventId);
      if (!existing) return { data: current, result: null };

      const updated: MonthlyMeetupFinanceExpense = {
        ...existing,
        category: input.category,
        description: input.description,
        amount_minor: input.amount_minor,
        status: input.status,
        vendor: input.vendor ?? null,
        expense_date: input.expense_date,
        notes: input.notes ?? null,
        updated_by_email: actorEmail,
        updated_at: now(),
        currency: MONTHLY_MEETUP_FINANCE_CURRENCY,
      };
      return {
        data: current.map((expense) => expense.id === expenseId ? updated : expense),
        result: updated,
      };
    },
  );
}
