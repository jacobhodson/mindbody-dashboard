-- ============================================================================
-- Add a 4th cadence: 'once' (a singular, non-recurring task with a fixed
-- due_date), plus due-date controls for recurring tasks (which day within
-- the week/month it's due, defaulting to end-of-period when unset).
-- ============================================================================

alter table task_templates drop constraint task_templates_cadence_check;
alter table task_templates add constraint task_templates_cadence_check
  check (cadence in ('daily','weekly','monthly','once'));

alter table task_completions drop constraint task_completions_period_type_check;
alter table task_completions add constraint task_completions_period_type_check
  check (period_type in ('daily','weekly','monthly','once'));

alter table task_templates add column due_date date;  -- cadence='once' only: the fixed due date
alter table task_templates add column due_day int;    -- cadence='weekly': 1(Mon)-7(Sun); cadence='monthly': 1-31; null = end of period
