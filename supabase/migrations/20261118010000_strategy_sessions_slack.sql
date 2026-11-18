-- "Publish to Slack" on strategy sessions (own channel, own webhook
-- SLACK_STRATEGY_SESSIONS_WEBHOOK). Written only by slack-publish.js.
alter table strategy_sessions
  add column if not exists slack_posted_at timestamptz,
  add column if not exists slack_posted_by uuid references staff(id) on delete set null;
