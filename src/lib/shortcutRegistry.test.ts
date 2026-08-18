import { describe, expect, it } from 'vitest';
import {
  getShortcuts,
  getShortcutsByScope,
  formatShortcutLabel,
  type ShortcutEntry,
} from './shortcutRegistry';

describe('shortcutRegistry', () => {
  it('returns a non-empty shortcut list', () => {
    const shortcuts = getShortcuts();
    expect(shortcuts.length).toBeGreaterThan(0);
  });

  it('each entry has id, keys, label, and scope', () => {
    for (const s of getShortcuts()) {
      expect(s.id).toBeTruthy();
      expect(s.keys).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.scope).toBeTruthy();
    }
  });

  it('filters by scope', () => {
    const global = getShortcutsByScope('global');
    expect(global.length).toBeGreaterThan(0);
    expect(global.every(s => s.scope === 'global')).toBe(true);
  });

  it('formatShortcutLabel renders Ctrl+Key style', () => {
    const label = formatShortcutLabel('Ctrl+Z');
    expect(label).toContain('Ctrl');
    expect(label).toContain('Z');
  });

  it('contains Space for play/pause', () => {
    const match = getShortcuts().find(s => s.id === 'play-pause');
    expect(match).toBeDefined();
    expect(match!.keys).toContain('Space');
  });

  it('contains Ctrl+S for save', () => {
    const match = getShortcuts().find(s => s.id === 'save');
    expect(match).toBeDefined();
    expect(match!.keys).toContain('Ctrl+S');
  });

  it('contains Q for quantize in piano-roll scope', () => {
    const match = getShortcuts().find(s => s.id === 'quantize');
    expect(match).toBeDefined();
    expect(match!.scope).toBe('piano-roll');
  });
});
