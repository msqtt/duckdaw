import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const memory = vi.hoisted(() => new Map<string, unknown>());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { memory.set(key, value); }),
  del: vi.fn(async (key: string) => { memory.delete(key); }),
}));

vi.stubGlobal('window', { confirm: confirmMock });

import {
  createNewProject,
  deleteTemplate,
  getTemplates,
  openTemplate,
  saveAsTemplate,
} from './projectStorage';
import { dawStore } from '../store/dawStore';

describe('project lifecycle and templates', () => {
  beforeEach(() => {
    memory.clear();
    confirmMock.mockReset();
    dawStore.getState().loadProject({
      projectId: 'source-project',
      createdAt: '2026-08-17T00:00:00.000Z',
      projectName: 'Source',
      bpm: 100,
      tracks: [{
        id: 'track-1', name: 'Lead', type: 'midi', volume: 0.8, pan: 0,
        isMuted: false, isSolo: false, instrument: 'synth', color: '#123456',
        reverb: 0, delay: 0,
      }],
      clips: [{
        id: 'clip-1', trackId: 'track-1', arrangementId: 'main', start: 0, duration: 4,
        type: 'midi', notes: [{ id: 'n1', note: 'C4', start: 0, duration: 1, velocity: 1 }],
      }],
      markers: [{ id: 'm1', name: 'Start', position: 0, color: '#fff' }],
    });
  });

  it('does not discard a dirty project when the user cancels New', async () => {
    dawStore.getState().setDirty(true);
    confirmMock.mockReturnValue(false);

    expect(await createNewProject()).toBe(false);
    expect(dawStore.getState().projectId).toBe('source-project');
  });

  it('creates a fresh project and clears file state after confirmation', async () => {
    memory.set('duckdaw_current_file_handle', { name: 'old.duckdaw' });
    dawStore.getState().setDirty(true);
    confirmMock.mockReturnValue(true);

    expect(await createNewProject()).toBe(true);
    expect(dawStore.getState()).toMatchObject({
      projectName: 'New Project', bpm: 120, tracks: [], clips: [], markers: [],
      isDirty: true,
    });
    expect(dawStore.getState().projectId).not.toBe('source-project');
    expect(memory.has('duckdaw_current_file_handle')).toBe(false);
    expect(dawStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('stores a structure-only template and creates a fresh identity when opened', async () => {
    await saveAsTemplate('Clean Template', 'No content');
    const [template] = await getTemplates();
    const zip = await JSZip.loadAsync(template.data);
    const project = JSON.parse(await zip.file('project.json')!.async('text'));

    expect(project.tracks).toHaveLength(1);
    expect(project.clips).toEqual([]);
    expect(project.markers).toEqual([]);

    await openTemplate(template.data);
    expect(dawStore.getState()).toMatchObject({
      projectName: 'Clean Template',
      clips: [],
      markers: [],
      isDirty: true,
    });
    expect(dawStore.getState().projectId).not.toBe(project.meta.projectId);
  });

  it('deletes a saved template', async () => {
    await saveAsTemplate('Disposable', 'Delete me');
    expect(await getTemplates()).toHaveLength(1);

    await deleteTemplate(0);

    expect(await getTemplates()).toEqual([]);
  });
});
