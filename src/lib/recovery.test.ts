import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => new Map<string, unknown>());

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { memory.set(key, value); }),
  del: vi.fn(async (key: string) => { memory.delete(key); }),
}));

import {
  clearRecoverySnapshot,
  getRecoverySnapshot,
  restoreRecoverySnapshot,
  saveRecoverySnapshot,
} from './projectStorage';
import { dawStore } from '../store/dawStore';

describe('project recovery snapshots', () => {
  beforeEach(async () => {
    memory.clear();
    dawStore.getState().loadProject({
      projectId: 'recovery-project',
      createdAt: '2026-08-17T00:00:00.000Z',
      projectName: 'Recover Me',
      bpm: 88,
      tracks: [],
      clips: [],
    });
  });

  it('stores a self-contained package independently from a file handle', async () => {
    const snapshot = await saveRecoverySnapshot();
    const stored = await getRecoverySnapshot();

    expect(stored).toEqual(snapshot);
    expect(stored).toMatchObject({ projectId: 'recovery-project' });
    expect(stored!.updatedAt).toBeGreaterThan(0);
    expect(stored!.packageData).toBeInstanceOf(ArrayBuffer);
  });

  it('restores the snapshot as a dirty editable project', async () => {
    await saveRecoverySnapshot();
    dawStore.getState().loadProject({
      projectId: 'other-project',
      projectName: 'Other',
      bpm: 120,
      tracks: [],
      clips: [],
    });

    const restored = await restoreRecoverySnapshot();

    expect(restored).toBe(true);
    expect(dawStore.getState()).toMatchObject({
      projectId: 'recovery-project',
      projectName: 'Recover Me',
      bpm: 88,
      isDirty: true,
    });
  });

  it('clears a recovery snapshot after explicit discard or save', async () => {
    await saveRecoverySnapshot();
    await clearRecoverySnapshot();

    expect(await getRecoverySnapshot()).toBeNull();
  });
});
