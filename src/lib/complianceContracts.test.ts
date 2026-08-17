import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('cross-component compliance contracts', () => {
  it('exposes grid snapping and complete marker management in the UI', () => {
    const topBar = source('../components/DAW/TopBar.tsx');
    const arrangeView = source('../components/DAW/ArrangeView.tsx');
    expect(topBar).toContain('setSnapToGrid(!snapToGrid)');
    expect(arrangeView).toContain('onContextMenu={(event) =>');
    expect(arrangeView).toContain('updateMarker(contextMenu.markerId!');
    expect(arrangeView).toContain('deleteMarker(contextMenu.markerId!)');
  });

  it('keeps GitHub credentials session-scoped with visible risk and clear controls', () => {
    const settings = source('../components/DAW/SettingsModal.tsx');
    expect(settings).toContain("sessionStorage.setItem('github_token'");
    expect(settings).not.toContain("localStorage.setItem('github_token'");
    expect(settings).toContain('avoid using it on untrusted pages');
    expect(settings).toContain('Clear GitHub token');
    expect(settings).toContain('res.status === 409');
  });

  it('provides theme persistence and dynamic System-theme handling', () => {
    const store = source('../store/dawStore.ts');
    const app = source('../DAWApp.tsx');
    expect(store).toContain("localStorage.setItem('duckdaw_theme'");
    expect(app).toContain("addEventListener?.('change', handleChange)");
  });

  it('uses non-blocking business-error feedback and modal accessibility semantics', () => {
    const files = [
      '../DAWApp.tsx',
      '../components/DAW/SettingsModal.tsx',
      '../components/DAW/ExportModal.tsx',
      '../components/DAW/ArrangeView.tsx',
    ].map(source).join('\n');
    expect(files).not.toMatch(/\balert\s*\(/);
    expect(files).not.toContain('console.error');
    expect(files).toContain('toast.error');

    for (const path of [
      '../components/ui/ConfirmModal.tsx',
      '../components/DAW/SettingsModal.tsx',
      '../components/DAW/ExportModal.tsx',
    ]) {
      const modal = source(path);
      expect(modal).toContain('role="dialog"');
      expect(modal).toContain('aria-modal="true"');
      expect(modal).toContain('aria-labelledby=');
    }
  });
});
