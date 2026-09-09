-- Manager-set override of a client's effective status, independent of the
-- Mindbody-synced `status` column (which the daily roster sync in
-- scheduled-client-sync.js overwrites every run). Never included in that
-- sync's upsert payload, so it's never clobbered — same protection pattern
-- as assigned_staff_id/package_id/next_program_due.
alter table clients add column status_override text;
