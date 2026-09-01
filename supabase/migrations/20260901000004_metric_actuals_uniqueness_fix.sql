-- ============================================================================
-- metric_actuals.unique(metric_key, staff_id, metric_date) has the same flaw
-- task_completions had (fixed in 20260901000001): a plain multi-column unique
-- constraint treats every NULL staff_id as distinct, so it never actually
-- prevents duplicates for studio-wide (staff_id null) metrics — exactly what
-- the new daily Mindbody sync writes. Fix it the same way: partial unique
-- indexes instead of one constraint that silently doesn't apply to NULLs.
-- ============================================================================

alter table metric_actuals drop constraint metric_actuals_metric_key_staff_id_metric_date_key;

create unique index metric_actuals_team_uniq
  on metric_actuals (metric_key, metric_date)
  where staff_id is null;

create unique index metric_actuals_individual_uniq
  on metric_actuals (metric_key, staff_id, metric_date)
  where staff_id is not null;
