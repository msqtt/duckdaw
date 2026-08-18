import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => {
  class BaseNode {
    connect() { return this; }
    chain() { return this; }
    toDestination() { return this; }
    dispose = vi.fn();
  }
  class Channel extends BaseNode {
    volume = { value: 0 };
    pan = { value: 0 };
    mute = false;
    solo = false;
  }
  class WetNode extends BaseNode { wet = { value: 0 }; }
  class Gain extends BaseNode {
    gain = {
      cancelScheduledValues: vi.fn(),
      setValueCurveAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
    };
    constructor(public value = 1) { super(); }
  }
  class PolySynth extends BaseNode {
    triggerAttackRelease = vi.fn();
    set = vi.fn();
  }
  class Part extends BaseNode {
    start = vi.fn(() => this);
    constructor(public callback: unknown, public events: unknown[]) { super(); }
  }
  return {
    Channel,
    Gain,
    Meter: class extends BaseNode {},
    Reverb: class extends WetNode {},
    FeedbackDelay: class extends WetNode {},
    UserMedia: class extends BaseNode { async open() {}; close() {} },
    Destination: { connect: vi.fn(), volume: { value: 0 } },
    Transport: {
      bpm: { value: 120 }, timeSignature: [4, 4], position: '0:0:0', loop: false,
      start: vi.fn(), pause: vi.fn(), stop: vi.fn(), cancel: vi.fn(), clear: vi.fn(),
      scheduleOnce: vi.fn((callback: (time: number) => void) => { callback(0); return 1; }),
    },
    PolySynth,
    Synth: class extends BaseNode {},
    Sampler: class extends BaseNode {},
    MembraneSynth: class extends BaseNode {},
    Player: class extends BaseNode {
      buffer = { duration: 12 };
      sync() { return this; }
      start = vi.fn();
      constructor(public options: Record<string, unknown> = {}) { super(); }
    },
    Part,
    Loop: class extends BaseNode {},
    context: { state: 'running', createMediaStreamDestination: () => ({ stream: {} }), resume: vi.fn() },
    start: vi.fn(),
  };
});

import { engine } from './audioEngine';
import type { Clip, Track } from '../store/dawStore';

const track: Track = {
  id: 'midi-track', name: 'MIDI', type: 'midi', volume: 0.8, pan: 0,
  isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0, instrument: 'synth', automationLanes: [],
};

const clip = (id: string, start: number): Clip => ({
  id, trackId: track.id, arrangementId: 'main', type: 'midi', start, duration: 4,
  notes: [{ id: `${id}-note`, note: 'C4', start: 0, duration: 1, velocity: 0.8 }],
});

describe('AudioEngine incremental clip synchronization', () => {
  it('keeps the existing Part when a clip scheduling signature is unchanged', () => {
    engine.syncClips([]);
    engine.syncTracks([track]);
    const clips = [clip('a', 0)];
    engine.syncClips(clips);
    const original = engine.partMap.get('a')!;

    engine.syncClips(structuredClone(clips));

    expect(engine.partMap.get('a')).toBe(original);
    expect(original.dispose).not.toHaveBeenCalled();
  });

  it('replaces only the changed clip and preserves unrelated Parts', () => {
    engine.syncClips([]);
    engine.syncTracks([track]);
    engine.syncClips([clip('a', 0), clip('b', 4)]);
    const originalA = engine.partMap.get('a')!;
    const originalB = engine.partMap.get('b')!;

    engine.syncClips([clip('a', 0), clip('b', 8)]);

    expect(engine.partMap.get('a')).toBe(originalA);
    expect(originalA.dispose).not.toHaveBeenCalled();
    expect(engine.partMap.get('b')).not.toBe(originalB);
    expect(originalB.dispose).toHaveBeenCalledOnce();
  });

  it('rebuilds an edited audio clip with non-destructive Player options', () => {
    const audioTrack: Track = {
      id: 'audio-track', name: 'Audio', type: 'audio', volume: 0.8, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0, automationLanes: [],
    };
    const audio: Clip = {
      id: 'audio', trackId: audioTrack.id, arrangementId: 'main', type: 'audio',
      start: 0, duration: 4, notes: [], bufferUrl: 'blob:audio',
      audioEdit: {
        sourceOffsetSeconds: 1, gainDb: -6, fadeInBeats: 1, fadeOutBeats: 0.5,
        fadeInCurve: 'linear', fadeOutCurve: 'linear', reversed: true,
      },
    };
    engine.syncClips([]);
    engine.syncTracks([audioTrack]);
    engine.syncClips([audio]);
    const original = engine.audioPlayers.get(audio.id)! as any;
    original.options.onload();
    expect(original.options).toMatchObject({ volume: -6, fadeIn: 0, fadeOut: 0, reverse: true });
    const fadeGain = engine.clipGains.get(audio.id)! as any;
    expect(fadeGain.gain.setValueCurveAtTime).toHaveBeenCalledTimes(2);

    engine.syncClips([{ ...audio, audioEdit: { ...audio.audioEdit!, gainDb: 3 } }]);
    expect(engine.audioPlayers.get(audio.id)).not.toBe(original);
    expect(original.dispose).toHaveBeenCalledOnce();
  });
});
