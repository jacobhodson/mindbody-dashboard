import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Plus, Maximize2, Minimize2, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * "Ask AI" — floating button bottom-right that opens a side panel for asking
 * questions of the dashboard's data. Managers/admins only (Dashboard.jsx
 * only mounts it for them, and ai-chat.js re-checks).
 *
 * The browser holds the raw Anthropic conversation (`apiMessages`) and calls
 * /api/ai-chat once per model turn until it reports `done` — see that file
 * for why. `display` is the friendly version rendered here.
 */

const SUGGESTIONS = [
  'Summarise this week\'s scoreboard against targets',
  'Which active clients haven\'t visited in 14+ days?',
  'How many leads and sales did we get last month, by source?',
  'Who are the Reds right now, and who coaches them?',
];

const MAX_STEPS = 15;

async function callAi(messages) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [input, setInput] = useState('');
  const [apiMessages, setApiMessages] = useState([]);
  const [display, setDisplay] = useState([]); // { role: 'user'|'assistant'|'error', text }
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [display, activity]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = useCallback(async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setDisplay((d) => [...d, { role: 'user', text: q }]);
    setBusy(true);
    setActivity('Thinking…');
    let messages = [...apiMessages, { role: 'user', content: q }];
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await callAi(messages);
        messages = res.messages;
        if (res.done) {
          setDisplay((d) => [...d, { role: 'assistant', text: res.answer }]);
          setApiMessages(messages);
          return;
        }
        setActivity(res.activity?.length ? `${res.activity.join(' · ')}…` : 'Looking at the data…');
      }
      throw new Error('That took too many steps — try a more specific question.');
    } catch (e) {
      setDisplay((d) => [...d, { role: 'error', text: e.message }]);
      // Keep the conversation consistent: drop this unanswered question so
      // the next one doesn't start from a dangling tool call.
    } finally {
      setBusy(false);
      setActivity('');
    }
  }, [apiMessages, busy]);

  const newChat = () => {
    if (busy) return;
    setApiMessages([]);
    setDisplay([]);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <>
      {/* ── Launcher ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-900/20 transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-300"
          aria-label="Ask AI about your data"
          title="Ask AI"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* ── Panel ── */}
      {open && (
        <div
          className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl transition-[width] ${wide ? 'sm:w-[min(760px,100vw)]' : 'sm:w-[420px]'}`}
          role="dialog"
          aria-label="Ask AI"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-semibold text-gray-900">Ask AI</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Beta</span>
            </div>
            <div className="flex items-center gap-1 text-gray-500">
              <button onClick={newChat} disabled={busy} className="rounded-md p-1.5 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40" title="New chat" aria-label="New chat">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => setWide((w) => !w)} className="hidden rounded-md p-1.5 hover:bg-gray-100 hover:text-gray-900 sm:block" title={wide ? 'Narrow' : 'Expand'} aria-label={wide ? 'Narrow panel' : 'Expand panel'}>
                {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-gray-100 hover:text-gray-900" title="Close" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {display.length === 0 ? (
              <div className="flex h-full flex-col justify-center">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="mb-1 text-center text-lg font-semibold text-gray-900">Ask about your gym's data</h2>
                <p className="mb-6 text-center text-sm text-gray-500">Clients, attendance, scoreboard, leads, sales, churn, coaches and more. It only sees what your login can see.</p>
                <div className="divide-y divide-gray-200 border-y border-gray-200">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900">
                      <MessageSquare className="h-4 w-4 shrink-0 text-gray-400" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {display.map((m, i) => (
                  m.role === 'user' ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-emerald-600 px-3.5 py-2 text-sm text-white">{m.text}</div>
                    </div>
                  ) : m.role === 'error' ? (
                    <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{m.text}</div>
                  ) : (
                    <div key={i} className="text-sm leading-relaxed text-gray-800"><Markdown text={m.text} /></div>
                  )
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{activity}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="border-t border-gray-200 p-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-white px-3 py-2 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                rows={1}
                placeholder="Ask a question…"
                className="max-h-40 flex-1 resize-none border-0 bg-transparent p-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-gray-400">AI can make mistakes — double-check numbers before acting on them.</p>
          </form>
        </div>
      )}
    </>
  );
}

// ── Minimal markdown → React (no HTML injection): headings, bullet and
// numbered lists, tables, paragraphs, **bold**, _italic_, `code`.
function inline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_\s][^_]*_)/g);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={k} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={k} className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em]">{p.slice(1, -1)}</code>;
    if (p.startsWith('_') && p.endsWith('_') && p.length > 2) return <em key={k}>{p.slice(1, -1)}</em>;
    return p;
  });
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function Markdown({ text }) {
  const lines = (text || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(
        <div key={out.length} className="my-2 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50"><tr>{head.map((h, j) => <th key={j} className="px-2.5 py-1.5 text-left font-semibold text-gray-700">{inline(h, `h${j}`)}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="px-2.5 py-1.5 text-gray-800">{inline(c, `c${ri}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) {
      out.push(<p key={out.length} className="mt-3 font-semibold text-gray-900 first:mt-0">{inline(heading[2], `hd${i}`)}</p>);
      i++; continue;
    }

    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={out.length} className={`my-1.5 space-y-0.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, j) => <li key={j}>{inline(it, `li${i}-${j}`)}</li>)}
        </List>
      );
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)])\s+|^#{1,4}\s|^\s*\|/.test(lines[i])) { para.push(lines[i]); i++; }
    if (para.length) out.push(<p key={out.length} className="my-1.5">{inline(para.join(' '), `p${i}`)}</p>);
    else i++;
  }
  return <>{out}</>;
}
