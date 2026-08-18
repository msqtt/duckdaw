/**
 * Single source of truth for all keyboard shortcuts in DuckDAW.
 * UI components and the ShortcutHelp overlay derive their labels from this registry.
 */

export type ShortcutScope = 'global' | 'piano-roll' | 'arrange';

export interface ShortcutEntry {
  id: string;
  keys: string;
  label: string;
  scope: ShortcutScope;
}

const SHORTCUTS: ShortcutEntry[] = [
  // Global
  { id: 'play-pause', keys: 'Space', label: 'Play / Pause', scope: 'global' },
  { id: 'stop', keys: 'Enter', label: 'Stop', scope: 'global' },
  { id: 'undo', keys: 'Ctrl+Z', label: 'Undo', scope: 'global' },
  { id: 'redo', keys: 'Ctrl+Shift+Z', label: 'Redo', scope: 'global' },
  { id: 'redo-alt', keys: 'Ctrl+Y', label: 'Redo (alt)', scope: 'global' },
  { id: 'save', keys: 'Ctrl+S', label: 'Save project', scope: 'global' },
  { id: 'save-as', keys: 'Ctrl+Shift+S', label: 'Save as…', scope: 'global' },
  { id: 'open', keys: 'Ctrl+O', label: 'Open project', scope: 'global' },
  { id: 'delete', keys: 'Delete', label: 'Delete selected', scope: 'global' },
  { id: 'duplicate', keys: 'Ctrl+D', label: 'Duplicate', scope: 'global' },
  { id: 'split-clip', keys: 'S', label: 'Split selected clip(s) at playhead', scope: 'arrange' },
  { id: 'copy', keys: 'Ctrl+C', label: 'Copy', scope: 'global' },
  { id: 'cut', keys: 'Ctrl+X', label: 'Cut', scope: 'global' },
  { id: 'paste', keys: 'Ctrl+V', label: 'Paste', scope: 'global' },
  { id: 'shortcut-help', keys: '?', label: 'Show keyboard shortcuts', scope: 'global' },
  { id: 'shortcut-help-alt', keys: 'F1', label: 'Show keyboard shortcuts', scope: 'global' },

  // Piano Roll
  { id: 'quantize', keys: 'Q', label: 'Quantize selected notes', scope: 'piano-roll' },
];

/** Get all registered shortcuts. */
export function getShortcuts(): ShortcutEntry[] {
  return SHORTCUTS;
}

/** Filter shortcuts by scope. */
export function getShortcutsByScope(scope: ShortcutScope): ShortcutEntry[] {
  return SHORTCUTS.filter(s => s.scope === scope);
}

/**
 * Format a keys string into a user-friendly display label.
 * e.g. "Ctrl+Shift+Z" → "Ctrl + Shift + Z"
 */
export function formatShortcutLabel(keys: string): string {
  return keys.split('+').join(' + ');
}
