import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getShortcutsByScope, formatShortcutLabel, type ShortcutScope } from '../../lib/shortcutRegistry';

interface ShortcutHelpProps {
  onClose: () => void;
}

const SCOPE_LABELS: Record<ShortcutScope, string> = {
  global: 'Global',
  'piano-roll': 'Piano Roll',
  arrange: 'Arrange View',
};

export function ShortcutHelp({ onClose }: ShortcutHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    queueMicrotask(() => focusable()[0]?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const scopes: ShortcutScope[] = ['global', 'piano-roll', 'arrange'];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onPointerDown={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900 z-10">
          <h2 id={titleId} className="font-bold text-neutral-900 dark:text-white">Keyboard Shortcuts</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </header>
        <div className="p-4 space-y-6">
          {scopes.map(scope => {
            const entries = getShortcutsByScope(scope);
            if (entries.length === 0) return null;
            return (
              <section key={scope}>
                <h3 className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                  {SCOPE_LABELS[scope]}
                </h3>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 gap-x-4">
                  {entries.map(entry => (
                    <React.Fragment key={entry.id}>
                      <dt className="text-sm text-neutral-700 dark:text-neutral-300">{entry.label}</dt>
                      <dd className="text-sm font-mono text-neutral-500 dark:text-neutral-400 text-right">
                        {formatShortcutLabel(entry.keys)}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
