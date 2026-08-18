import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => new Map<string, unknown>());
const setMock = vi.hoisted(() => vi.fn(async (key: string, value: unknown) => { memory.set(key, value); }));

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => memory.get(key)),
  set: setMock,
  del: vi.fn(async (key: string) => { memory.delete(key); }),
}));

vi.stubGlobal('fetch', vi.fn(async () => ({
  arrayBuffer: async () => new TextEncoder().encode('shared-audio').buffer,
})));
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:restored-audio'),
  revokeObjectURL: vi.fn(),
});

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

  it('stores project metadata independently without rebuilding a ZIP package', async () => {
    const snapshot = await saveRecoverySnapshot();
    const stored = await getRecoverySnapshot();

    expect(stored).toEqual(snapshot);
    expect(stored).toMatchObject({ version: 2, projectId: 'recovery-project' });
    expect(stored!.updatedAt).toBeGreaterThan(0);
    expect(stored).toHaveProperty('project.projectName', 'Recover Me');
    expect(stored).not.toHaveProperty('packageData');
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

  it('writes an unchanged audio asset once across multiple metadata snapshots and restores it', async () => {
    dawStore.getState().loadProject({
      projectId: 'audio-recovery',
      projectName: 'Audio Recovery',
      bpm: 120,
      tracks: [{
        id: 'audio-track', name: 'Audio', type: 'audio', volume: 0.8, pan: 0,
        isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0, automationLanes: [],
      }],
      clips: [{
        id: 'audio-clip', trackId: 'audio-track', arrangementId: 'main', type: 'audio',
        start: 0, duration: 4, notes: [], bufferUrl: 'blob:source-audio', mimeType: 'audio/webm',
      }],
    });
    setMock.mockClear();

    const first = await saveRecoverySnapshot();
    dawStore.getState().setBpm(121);
    await saveRecoverySnapshot();

    const assetWrites = setMock.mock.calls.filter(([key]) => String(key).startsWith('duckdaw_recovery_asset_v2:'));
    expect(assetWrites).toHaveLength(1);
    expect(first).toHaveProperty('project.clips.0.bufferUrl');
    expect((first as any).project.clips[0].bufferUrl).toMatch(/^recovery-assets\//);

    dawStore.getState().loadProject({ projectId: 'other', projectName: 'Other', tracks: [], clips: [] });
    expect(await restoreRecoverySnapshot()).toBe(true);
    expect(dawStore.getState().clips[0]).toMatchObject({
      id: 'audio-clip', bufferUrl: 'blob:restored-audio', mimeType: 'audio/webm',
    });
  });

  it('clears a recovery snapshot after explicit discard or save', async () => {
    await saveRecoverySnapshot();
    await clearRecoverySnapshot();

    expect(await getRecoverySnapshot()).toBeNull();
  });
});
