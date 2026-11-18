-- "Publish to Slack" on client notes: remembers when (and by whom) a note
-- was posted to #client-headlines so the button can show it's already gone.
-- Written only by netlify/functions/slack-publish.js (service role).
alter table client_notes
  add column if not exists slack_posted_at timestamptz,
  add column if not exists slack_posted_by uuid references staff(id) on delete set null;
