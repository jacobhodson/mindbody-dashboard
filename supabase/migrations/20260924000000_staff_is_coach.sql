-- ============================================================================
-- Distinguishes "does this staff member actually coach/generate revenue"
-- from `role` (which only ever governs dashboard permission level via
-- is_manager() -- 'admin' there means "full access", not "office admin,
-- not a coach"). Conflating the two would be wrong here: this account's
-- `role` is 'manager' (it needs dashboard access) but it's a generic admin
-- login, not a real coach, so it shouldn't appear in coach-performance
-- reporting -- an orthogonal, purely-reporting concern.
--
-- Defaults true so every existing/future coach needs no explicit opt-in;
-- only the admin account gets flipped false.
-- ============================================================================

alter table staff add column is_coach boolean not null default true;

update staff set is_coach = false where email = 'admin@newstrength.com.au';
