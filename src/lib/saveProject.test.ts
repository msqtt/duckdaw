import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => new Map<string, unknown>());
const setDirty = vi.hoisted(() => vi.fn());

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { memory.set(key, value); }),
  del: vi.fn(async (key: string) => { memory.delete(key); }),
}));

vi.mock('../store/dawStore', () => ({
  useDAWStore: {
    getState: () => ({
      projectId: 'save-project',
      createdAt: '2026-08-17T00:00:00.000Z',
      projectName: 'Save Test',
      bpm: 120,
      timeSignature: [4, 4],
      isLooping: false,
      loopStart: 0,
      loopEnd: 4,
      metronomeOn: false,
      metronomeSound: 'click',
      metronomeVolume: -10,
      metronomeSubdivisions: 1,
      masterVolume: 0.8,
      markers: [],
      arrangements: [{ id: 'main', name: 'Main' }],
      activeArrangementId: 'main',
      tracks: [],
      clips: [],
      setDirty,
    }),
  },
}));

import { saveProject } from './projectStorage';

const createHandle = () => {
  const writable = { write: vi.fn(), close: vi.fn() };
  return {
    name: 'Save Test.duckdaw',
    queryPermission: vi.fn(async () => 'granted'),
    requestPermission: vi.fn(async () => 'granted'),
    createWritable: vi.fn(async () => writable),
    writable,
  };
};

describe('saveProject result semantics', () => {
  beforeEach(() => {
    memory.clear();
    setDirty.mockReset();
  });

  it('returns skipped for background save without an existing handle', async () => {
    vi.stubGlobal('window', {});
    await expect(saveProject(false, true)).resolves.toBe('skipped');
    expect(setDirty).not.toHaveBeenCalled();
  });

  it('returns cancelled when the file picker is dismissed', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => { throw abort; }) });

    await expect(saveProject()).resolves.toBe('cancelled');
    expect(setDirty).not.toHaveBeenCalled();
  });

  it('returns saved only after the package is written and closed', async () => {
    const handle = createHandle();
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => handle) });

    await expect(saveProject()).resolves.toBe('saved');
    expect(handle.writable.write).toHaveBeenCalledWith(expect.any(Blob));
    expect(handle.writable.close).toHaveBeenCalledOnce();
    expect(setDirty).toHaveBeenCalledWith(false);
  });

  it('returns downloaded for browsers without the File System Access API', async () => {
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ click, style: {} })),
      body: { appendChild, removeChild },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:download'),
      revokeObjectURL: vi.fn(),
    });

    await expect(saveProject()).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledOnce();
    expect(setDirty).toHaveBeenCalledWith(false);
  });
});
