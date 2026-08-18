import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  schedules: [] as Array<{ id: number; callback: (time: number) => void; at: unknown }>,
  clears: [] as number[],
  bpmSet: vi.fn(),
  bpmRamp: vi.fn(),
  volumeSet: vi.fn(),
  volumeLinear: vi.fn(),
}));

vi.mock('tone', () => {
  let nextId = 1;
  class Param {
    value = 0;
    setValueAtTime = calls.volumeSet;
    linearRampToValueAtTime = calls.volumeLinear;
    exponentialRampToValueAtTime = vi.fn();
    cancelScheduledValues = vi.fn();
    linearRampTo = vi.fn();
  }
  class BaseNode {
    connect() { return this; }
    chain() { return this; }
    toDestination() { return this; }
    dispose() {}
  }
  class Channel extends BaseNode {
    volume = new Param();
    pan = new Param();
    mute = false;
    solo = false;
  }
  class WetNode extends BaseNode { wet = new Param(); }
  return {
    Channel,
    Meter: class extends BaseNode {},
    Reverb: class extends WetNode {},
    FeedbackDelay: class extends WetNode {},
    Gain: class extends BaseNode { gain = new Param(); },
    UserMedia: class extends BaseNode { async open() {}; close() {} },
    PolySynth: class extends BaseNode { set() {}; triggerAttackRelease() {} },
    Synth: class extends BaseNode {},
    Sampler: class extends BaseNode {},
    MembraneSynth: class extends BaseNode { triggerAttackRelease() {} },
    Player: class extends BaseNode {},
    Part: class extends BaseNode { start() {} },
    Loop: class extends BaseNode { start() {}; stop() {} },
    Destination: { connect: vi.fn(), volume: new Param() },
    Transport: {
      bpm: {
        value: 120,
        setValueAtTime: calls.bpmSet,
        linearRampTo: calls.bpmRamp,
        cancelScheduledValues: vi.fn(),
      },
      timeSignature: [4, 4], position: '0:0:0', loop: false,
      schedule(callback: (time: number) => void, at: unknown) {
        const id = nextId++;
        calls.schedules.push({ id, callback, at });
        return id;
      },
      scheduleOnce: vi.fn(() => nextId++),
      clear(id: number) { calls.clears.push(id); },
      start: vi.fn(), pause: vi.fn(), stop: vi.fn(),
    },
    context: { state: 'running', resume: vi.fn(), createMediaStreamDestination: () => ({ stream: {} }) },
    start: vi.fn(),
  };
});

import { engine } from './audioEngine';
import type { Track } from '../store/dawStore';

describe('AudioEngine tempo and automation scheduling', () => {
  beforeEach(() => {
    calls.schedules.length = 0;
    calls.clears.length = 0;
    calls.bpmSet.mockClear();
    calls.bpmRamp.mockClear();
    calls.volumeSet.mockClear();
    calls.volumeLinear.mockClear();
    engine.syncTracks([]);
    engine.syncAutomation([]);
  });

  it('schedules a BPM-linear segment and clears it on resync', () => {
    engine.syncTempoTrack([
      { id: 'a', beat: 0, bpm: 60, curve: 'linear' },
      { id: 'b', beat: 4, bpm: 120, curve: 'step' },
    ]);
    expect(calls.schedules).toHaveLength(1);
    expect(calls.schedules[0].at).toBe('0:0:0');
    calls.schedules[0].callback(10);
    expect(calls.bpmRamp).toHaveBeenCalledWith(120, 4 * Math.log(2), 10);

    const oldId = calls.schedules[0].id;
    engine.syncTempoTrack([{ id: 'only', beat: 0, bpm: 100, curve: 'step' }]);
    expect(calls.clears).toContain(oldId);
  });

  it('starts a parameter ramp at the segment start and targets its later end time', () => {
    const track: Track = {
      id: 'track', name: 'Track', type: 'audio', volume: 0.8, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0,
      automationLanes: [{
        id: 'lane', target: 'volume', enabled: true,
        points: [
          { id: 'p0', beat: 0, value: 0.5, curve: 'linear' },
          { id: 'p1', beat: 4, value: 1, curve: 'step' },
        ],
      }],
    };
    engine.syncTracks([track]);
    engine.syncTempoTrack([{ id: 'tempo', beat: 0, bpm: 120, curve: 'step' }]);
    calls.schedules.length = 0;
    engine.syncAutomation([track]);

    const ramp = calls.schedules.find(item => item.at === 0);
    expect(ramp).toBeDefined();
    ramp!.callback(20);
    expect(calls.volumeLinear).toHaveBeenCalled();
    const [, targetTime] = calls.volumeLinear.mock.calls.at(-1)!;
    expect(targetTime).toBeCloseTo(22, 8);

    const ids = calls.schedules.map(item => item.id);
    engine.syncAutomation([]);
    expect(ids.every(id => calls.clears.includes(id))).toBe(true);
  });
});
