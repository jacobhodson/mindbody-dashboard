import { useState, useEffect } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';

export default function OnboardingTaskModal({ task, onClose }) {
  const [copied, setCopied] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(task.script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-xl border border-gray-300 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-200">
          <div>
            <p className="text-xs font-medium text-emerald-600 mb-1">Week {task.week} · Task reference</p>
            <h2 className="text-base font-semibold text-gray-900">{task.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Description */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">What & Why</p>
            <p className="text-sm text-gray-700 leading-relaxed">{task.description}</p>
          </div>

          {/* Script */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Script / Reference</p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="rounded-lg border border-gray-300 bg-gray-200 px-4 py-3">
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{task.script}</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Replace [Name] with the client's first name before sending.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 hover:text-gray-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
