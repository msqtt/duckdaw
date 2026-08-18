import { describe, expect, it, vi } from 'vitest';

const disposed = vi.hoisted(() => ({
  channel: vi.fn(),
  meter: vi.fn(),
  reverb: vi.fn(),
  delay: vi.fn(),
}));

vi.mock('tone', () => {
  class BaseNode {
    connect() { return this; }
    chain() { return this; }
    toDestination() { return this; }
  }
  class Gain extends BaseNode {
    gain = { value: 1 };
    dispose() {}
  }
  class Channel extends BaseNode {
    volume = { value: 0 };
    pan = { value: 0 };
    mute = false;
    solo = false;
    dispose() { disposed.channel(); }
  }
  class Meter extends BaseNode {
    dispose() { disposed.meter(); }
  }
  class Reverb extends BaseNode {
    wet = { value: 0 };
    dispose() { disposed.reverb(); }
  }
  class FeedbackDelay extends BaseNode {
    wet = { value: 0 };
    dispose() { disposed.delay(); }
  }
  class UserMedia extends BaseNode {
    async open() {}
    close() {}
  }
  return {
    Gain,
    Channel,
    Meter,
    Reverb,
    FeedbackDelay,
    UserMedia,
    Destination: { connect: vi.fn() },
    Transport: {
      bpm: { value: 120 },
      timeSignature: [4, 4],
      position: '0:0:0',
      loop: false,
      start: vi.fn(), pause: vi.fn(), stop: vi.fn(), cancel: vi.fn(),
    },
    PolySynth: class extends BaseNode {},
    Synth: class extends BaseNode {},
    Sampler: class extends BaseNode {},
    MembraneSynth: class extends BaseNode {},
    Player: class extends BaseNode {},
    Part: class extends BaseNode {},
    Loop: class extends BaseNode {},
    context: { createMediaStreamDestination: () => ({ stream: {} }) },
    start: vi.fn(),
  };
});

import { engine } from './audioEngine';

describe('AudioEngine resource lifecycle', () => {
  it('disposes channel, meter and effects when a track is removed', () => {
    const track = {
      id: 'audio-1', name: 'Audio', type: 'audio' as const,
      volume: 0.8, pan: 0, isMuted: false, isSolo: false,
      color: '#fff', reverb: 0.2, delay: 0.3, automationLanes: [],
    };

    engine.syncTracks([track]);
    engine.syncTracks([]);

    expect(disposed.channel).toHaveBeenCalledOnce();
    expect(disposed.meter).toHaveBeenCalledOnce();
    expect(disposed.reverb).toHaveBeenCalledOnce();
    expect(disposed.delay).toHaveBeenCalledOnce();
  });
});
