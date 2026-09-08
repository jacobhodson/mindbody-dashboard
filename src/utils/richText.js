/**
 * Lightweight markdown-style formatting — **bold**, *italic*, _underline_ —
 * stored as plain text (no schema/rendering-library dependency) and parsed
 * into React nodes wherever it's displayed. Typing the markers by hand works
 * too, same as Slack/GitHub/Reddit's plain-text formatting shortcuts.
 */
import { createElement, Fragment } from 'react';

// Order matters: ** before * so "**bold**" isn't consumed as two italics.
const FORMAT_REGEX = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;

export function renderFormatted(text) {
  if (!text) return text;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  FORMAT_REGEX.lastIndex = 0;
  while ((match = FORMAT_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(createElement('strong', { key: key++ }, match[1]));
    else if (match[2] !== undefined) nodes.push(createElement('em', { key: key++ }, match[2]));
    else if (match[3] !== undefined) nodes.push(createElement('u', { key: key++ }, match[3]));
    lastIndex = FORMAT_REGEX.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return createElement(Fragment, null, ...nodes);
}

// Wraps the current selection (or inserts a placeholder) in the given
// before/after markers, returning the new value and where the selection
// should land afterward — used by RichTextField's toolbar buttons.
export function wrapSelection(value, selectionStart, selectionEnd, marker) {
  const hasSelection = selectionEnd > selectionStart;
  const selected = hasSelection ? value.slice(selectionStart, selectionEnd) : 'text';
  const newValue = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd);
  return {
    value: newValue,
    selectionStart: selectionStart + marker.length,
    selectionEnd: selectionStart + marker.length + selected.length,
  };
}
