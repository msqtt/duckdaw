import { describe, expect, it, vi } from 'vitest';
import {
  cancelDecision,
  getActiveDecision,
  requestDecision,
  resolveDecision,
  subscribeDecision,
} from './decisionService';

describe('decision service', () => {
  it('publishes a decision and resolves the caller with the selected choice', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDecision(listener);
    const pending = requestDecision({
      title: 'Discard changes?', message: 'Unsaved work',
      options: [{ id: 'discard', label: 'Discard' }, { id: 'cancel', label: 'Cancel' }],
    });

    expect(getActiveDecision()?.title).toBe('Discard changes?');
    resolveDecision('discard');

    await expect(pending).resolves.toEqual({ choice: 'discard', value: undefined });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('returns trimmed input values and treats Escape/cancel as null', async () => {
    const input = requestDecision({
      title: 'Name marker', message: 'Choose a name', input: { defaultValue: ' Verse ' },
      options: [{ id: 'save', label: 'Save', requiresValue: true }],
    });
    resolveDecision('save', '  Chorus  ');
    await expect(input).resolves.toEqual({ choice: 'save', value: 'Chorus' });

    const cancelled = requestDecision({
      title: 'Delete?', message: 'Confirm', options: [{ id: 'delete', label: 'Delete' }],
    });
    cancelDecision();
    await expect(cancelled).resolves.toBeNull();
  });
});
