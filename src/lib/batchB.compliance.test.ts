import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Batch B UX/A11y compliance contracts', () => {
  describe('ShortcutHelp overlay', () => {
    it('DAWApp registers ? and F1 to open ShortcutHelp', () => {
      const app = source('../DAWApp.tsx');
      expect(app).toContain('ShortcutHelp');
      expect(app).toContain("'?'");
      expect(app).toContain('F1');
    });

    it('ShortcutHelp is keyboard-dismissible and uses dialog semantics', () => {
      const help = source('../components/ui/ShortcutHelp.tsx');
      expect(help).toContain('role="dialog"');
      expect(help).toContain('aria-modal="true"');
      expect(help).toContain('aria-labelledby=');
      expect(help).toContain('Escape');
    });
  });

  describe('ArrangeView empty states', () => {
    it('shows CTA buttons when no tracks exist', () => {
      const arrangeView = source('../components/DAW/ArrangeView.tsx');
      expect(arrangeView).toContain('data-testid="empty-state-cta"');
      expect(arrangeView).toContain('Add MIDI Track');
      expect(arrangeView).toContain('Add Audio Track');
    });

    it('shows hint when tracks exist but no clips', () => {
      const arrangeView = source('../components/DAW/ArrangeView.tsx');
      expect(arrangeView).toContain('data-testid="no-clips-hint"');
    });
  });

  describe('Mixer accessibility', () => {
    it('volume sliders have aria-label', () => {
      const mixer = source('../components/DAW/Mixer.tsx');
      expect(mixer).toContain('aria-label=');
      // Track volume
      expect(mixer).toMatch(/aria-label="[^"]*[Vv]olume/);
    });

    it('pan sliders have aria-label', () => {
      const mixer = source('../components/DAW/Mixer.tsx');
      expect(mixer).toMatch(/aria-label=.*[Pp]an/);
    });

    it('volume and pan sliders have aria-valuetext', () => {
      const mixer = source('../components/DAW/Mixer.tsx');
      expect(mixer).toMatch(/aria-valuetext=/);
    });

    it('mute/solo buttons have aria-label', () => {
      const mixer = source('../components/DAW/Mixer.tsx');
      expect(mixer).toMatch(/aria-label=.*[Mm]ute/);
      expect(mixer).toMatch(/aria-label=.*[Ss]olo/);
    });
  });

  describe('status and progress announcements', () => {
    it('uses polite live status semantics for toasts', () => {
      const app = source('../DAWApp.tsx');
      expect(app).toContain("role: 'status'");
      expect(app).toContain("'aria-live': 'polite'");
    });

    it('exposes export progress as a progressbar', () => {
      const modal = source('../components/DAW/ExportModal.tsx');
      expect(modal).toContain('role="progressbar"');
      expect(modal).toContain('aria-valuenow={progress}');
    });
  });


  describe('ConfirmModal focus management', () => {
    it('supports Escape, focus trapping, and focus restoration', () => {
      const modal = source('../components/ui/ConfirmModal.tsx');
      expect(modal).toContain("event.key === 'Escape'");
      expect(modal).toContain("event.key !== 'Tab'");
      expect(modal).toContain('previousFocus?.focus()');
    });
  });
  describe('DecisionHost static compliance', () => {
    it('maintains existing dialog accessibility contract', () => {
      const host = source('../components/ui/DecisionHost.tsx');
      expect(host).toContain('role="dialog"');
      expect(host).toContain('aria-modal="true"');
      expect(host).toContain('aria-labelledby=');
      expect(host).toContain('aria-describedby=');
    });

    it('traps focus within the dialog', () => {
      const host = source('../components/ui/DecisionHost.tsx');
      expect(host).toContain("'Tab'");
      expect(host).toContain('first.focus()');
      expect(host).toContain('last.focus()');
    });
  });
});
