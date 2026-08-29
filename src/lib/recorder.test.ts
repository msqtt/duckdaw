import { beforeEach, describe, expect, it, vi } from 'vitest';

const close = vi.hoisted(() => vi.fn());
const open = vi.hoisted(() => vi.fn(async () => undefined));
const connect = vi.hoisted(() => vi.fn());

vi.mock('tone', () => ({
  UserMedia: class {
    open = open;
    connect = connect;
    close = close;
  },
  Meter: class {
    getValue() { return -24; }
    dispose() {}
  },
  context: {
    createMediaStreamDestination: () => ({ stream: {} }),
  },
}));

class FakeMediaRecorder {
  static stopDelayMs = 0;
  state = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown) {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.state = 'inactive';
    if (FakeMediaRecorder.stopDelayMs > 0) setTimeout(() => this.onstop?.(), FakeMediaRecorder.stopDelayMs);
    else this.onstop?.();
  }
}

vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

import { MicRecorder } from './recorder';

describe('MicRecorder', () => {
  beforeEach(() => {
    FakeMediaRecorder.stopDelayMs = 0;
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    open.mockClear();
    connect.mockClear();
    close.mockClear();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:recording') });
  });

  it('returns recorded MIME metadata and elapsed duration, then closes input', async () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(1_000).mockReturnValueOnce(3_500);
    const recorder = new MicRecorder();

    await recorder.start();
    expect(recorder.getInputLevelDb()).toBe(-24);
    const result = await recorder.stop();

    expect(result).toEqual({
      url: 'blob:recording',
      mimeType: 'audio/webm;codecs=opus',
      durationSeconds: 2.5,
    });
    expect(open).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    now.mockRestore();
  });

  it('releases the opened input when MediaRecorder startup fails', async () => {
    vi.stubGlobal('MediaRecorder', class {
      constructor() {
        throw new Error('recorder unavailable');
      }
    });
    const recorder = new MicRecorder();

    await expect(recorder.start()).rejects.toThrow('recorder unavailable');

    expect(close).toHaveBeenCalledOnce();
    expect(recorder.mediaRecorder).toBeNull();
  });

  it('keeps a restarted recorder alive when the previous onstop arrives late', async () => {
    const recorder = new MicRecorder();
    await recorder.start();
    FakeMediaRecorder.stopDelayMs = 50;
    const oldStop = recorder.stop();

    await recorder.start();
    const restarted = recorder.mediaRecorder;
    expect(restarted?.state).toBe('recording');
    await oldStop;
    expect(recorder.mediaRecorder).toBe(restarted);
    expect(recorder.mediaRecorder?.state).toBe('recording');

    FakeMediaRecorder.stopDelayMs = 0;
    await expect(recorder.stop()).resolves.toMatchObject({ url: 'blob:recording' });
  });

  it('cancels a pending start before it can claim shared recorder state', async () => {
    let releaseOpen!: () => void;
    open.mockImplementationOnce(() => new Promise<void>(resolve => { releaseOpen = resolve; }));
    const recorder = new MicRecorder();

    const pendingStart = recorder.start();
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    await expect(recorder.stop()).resolves.toBeNull();
    releaseOpen();

    await expect(pendingStart).rejects.toMatchObject({ name: 'AbortError' });
    expect(recorder.mediaRecorder).toBeNull();
  });

  it('returns null when no recording is active', async () => {
    await expect(new MicRecorder().stop()).resolves.toBeNull();
  });
});
