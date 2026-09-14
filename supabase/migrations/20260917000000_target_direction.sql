-- ============================================================================
-- Scoreboard: "negative" metrics (e.g. churn) where the goal is to stay
-- UNDER target_value, not reach/exceed it. Metric-level like `department` —
-- shared across a metric's weekly/monthly rows, not per-cadence, since a
-- metric's direction doesn't change between views of it.
-- ============================================================================

alter table targets add column direction text not null default 'at_least'
  check (direction in ('at_least', 'at_most'));

comment on column targets.direction is
  'at_least: hit/exceed target_value (default, "more is better"). at_most: stay at/under target_value ("less is better", e.g. churn).';
