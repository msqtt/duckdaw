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
    this.onstop?.();
  }
}

vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

import { MicRecorder } from './recorder';

describe('MicRecorder', () => {
  beforeEach(() => {
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

  it('returns null when no recording is active', async () => {
    await expect(new MicRecorder().stop()).resolves.toBeNull();
  });
});
