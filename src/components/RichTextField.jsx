import { useRef, useEffect } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';
import { wrapSelection } from '../utils/richText.js';

const BUTTONS = [
  { marker: '**', Icon: Bold,      label: 'Bold' },
  { marker: '*',  Icon: Italic,    label: 'Italic' },
  { marker: '_',  Icon: Underline, label: 'Underline' },
];

/**
 * Drop-in replacement for a plain <input>/<textarea> that adds a small
 * Slack-style formatting toolbar (Bold/Italic/Underline) above it. Selecting
 * text and clicking a button wraps it in markdown-style markers; the same
 * value works everywhere renderFormatted() is used to display it.
 */
export default function RichTextField({ value, onChange, placeholder, multiline, autoFocus, className = '' }) {
  const fieldRef = useRef(null);
  const pendingSelection = useRef(null);

  // Restoring selection right after applyFormat (via rAF/setTimeout) races
  // React's own commit of the new `value` to the DOM — sometimes losing.
  // Tying it to this effect instead guarantees it runs only once the
  // textarea/input actually reflects the new value.
  useEffect(() => {
    if (!pendingSelection.current || !fieldRef.current) return;
    const { start, end } = pendingSelection.current;
    pendingSelection.current = null;
    fieldRef.current.setSelectionRange(start, end);
  }, [value]);

  const applyFormat = (marker) => {
    const el = fieldRef.current;
    if (!el) return;
    const result = wrapSelection(value, el.selectionStart, el.selectionEnd, marker);
    pendingSelection.current = { start: result.selectionStart, end: result.selectionEnd };
    onChange(result.value);
  };

  const fieldClass = `w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className}`;

  return (
    <div>
      <div className="mb-1 flex gap-0.5">
        {BUTTONS.map(({ marker, Icon, label }) => (
          <button
            key={marker}
            type="button"
            title={label}
            // Buttons steal focus on mousedown by default, which loses the
            // textarea's selection before onClick even fires — prevent that
            // so the selection survives to be wrapped.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat(marker)}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      {multiline ? (
        <textarea
          ref={fieldRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={2}
          className={`${fieldClass} resize-none`}
        />
      ) : (
        <input
          ref={fieldRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={fieldClass}
        />
      )}
    </div>
  );
}
