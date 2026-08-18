import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import {
  cancelDecision,
  getActiveDecision,
  resolveDecision,
  subscribeDecision,
  type DecisionOptionKind,
} from '../../lib/decisionService';

const buttonClass: Record<DecisionOptionKind, string> = {
  primary: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  secondary: 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-100',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
};

export function DecisionHost() {
  const decision = useSyncExternalStore(subscribeDecision, getActiveDecision, getActiveDecision);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const titleId = React.useId();
  const descriptionId = React.useId();

  useEffect(() => {
    setValue(decision?.input?.defaultValue ?? '');
  }, [decision?.requestId]);

  useEffect(() => {
    if (!decision) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    queueMicrotask(() => (dialog?.querySelector<HTMLElement>('input') ?? focusable()[0])?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && decision.dismissible !== false) {
        event.preventDefault();
        cancelDecision();
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
  }, [decision?.requestId]);

  if (!decision) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onPointerDown={() => decision.dismissible !== false && cancelDecision()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id={titleId} className="font-bold text-neutral-900 dark:text-white">{decision.title}</h2>
          {decision.dismissible !== false && (
            <button type="button" aria-label="Close dialog" onClick={cancelDecision} className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800">
              <X size={18} />
            </button>
          )}
        </header>
        <div className="space-y-4 p-4">
          <p id={descriptionId} className="text-sm text-neutral-600 dark:text-neutral-300">{decision.message}</p>
          {decision.input && (
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              {decision.input.label ?? 'Value'}
              <input
                value={value}
                placeholder={decision.input.placeholder}
                onChange={event => setValue(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return;
                  const primary = decision.options.find(option => option.kind === 'primary') ?? decision.options[0];
                  if (!primary.requiresValue || value.trim()) resolveDecision(primary.id, value);
                }}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </label>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          {decision.options.map(option => (
            <button
              key={option.id}
              type="button"
              disabled={option.requiresValue && !value.trim()}
              onClick={() => resolveDecision(option.id, value)}
              className={`rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${buttonClass[option.kind ?? 'secondary']}`}
            >
              {option.label}
            </button>
          ))}
        </footer>
      </div>
    </div>
  );
}
