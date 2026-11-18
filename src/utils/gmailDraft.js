/**
 * Opens a Gmail compose window pre-filled for the client (member) — used by
 * the "Draft email" buttons on client notes and strategy sessions. Nothing is
 * sent: it lands in the coach's own Gmail as an unsent draft to edit/send.
 * authuser picks the coach's work account when they're signed in to several.
 */

// Our **bold** / *italic* / _underline_ markers (richText.js) don't render in
// a plain-text email body, so strip them.
function plain(text) {
  return String(text || '').replace(/\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g, (_, b, i, u) => b ?? i ?? u);
}

// Gmail drops very long compose URLs; keep the body well under that.
const MAX_BODY = 6000;

export function openGmailDraft({ to, subject, body, from }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', su: subject, body: plain(body).slice(0, MAX_BODY) });
  if (to) params.set('to', to);
  if (from) params.set('authuser', from);
  window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank', 'noopener');
}

export function draftBody({ firstName, text, staffName, businessName }) {
  const signOff = [staffName?.split(' ')[0], businessName].filter(Boolean).join('\n');
  return `Hi ${firstName || 'there'},\n\n${plain(text).trim()}\n\n${signOff}`;
}
