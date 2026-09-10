-- Permanently retire monthly meetup finances. Apply after deploying the removal.
-- This destroys all monthly expense and category rows. Restore requires a backup.
-- No CASCADE: unexpected dependencies must stop the migration for investigation.
begin;
set local lock_timeout = '5s';

drop table if exists public.monthly_meetup_finance_expenses;
drop table if exists public.monthly_meetup_finance_categories;

-- Finance audit metadata can contain the removed expense details.
delete from public.admin_audit_log
where action in (
  'monthly_meetup.finance.expense_create',
  'monthly_meetup.finance.expense_update',
  'monthly_meetup.finance.category_create'
)
and target_type in ('monthly_meetup_finance_expense', 'monthly_meetup_finance_category');

commit;
