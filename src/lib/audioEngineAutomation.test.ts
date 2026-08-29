import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  schedules: [] as Array<{ id: number; callback: (time: number) => void; at: unknown }>,
  clears: [] as number[],
  bpmSet: vi.fn(),
  bpmRamp: vi.fn(),
  volumeSet: vi.fn(),
  volumeLinear: vi.fn(),
  pluginParameters: vi.fn(),
  gains: [] as Array<{ value: number }>,
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
    Gain: class extends BaseNode {
      gain = new Param();
      constructor(value = 1) {
        super();
        this.gain.value = value;
        calls.gains.push(this.gain);
      }
    },
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

import * as Tone from 'tone';
import { AudioEngine, engine } from './audioEngine';
import { PluginRegistry } from './pluginSdk';
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


describe('AudioEngine control and plugin automation', () => {
  it('recomputes every host audibility gate for scheduled Solo and Mute automation', () => {
    const localEngine = new AudioEngine();
    const first: Track = {
      id: 'first', name: 'First', type: 'audio', volume: 1, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0,
      automationLanes: [],
    };
    const second: Track = {
      ...first,
      id: 'second',
      name: 'Second',
    };

    const gainStart = calls.gains.length;
    localEngine.syncTracks([first, second]);
    const trackGains = calls.gains.slice(gainStart);
    const firstAudibility = trackGains[1];
    const secondAudibility = trackGains[3];
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 1]);

    calls.schedules.length = 0;
    const soloTrack: Track = {
      ...first,
      automationLanes: [{
        id: 'solo-lane', target: 'track.solo', enabled: true, valueType: 'discrete',
        points: [
          { id: 'solo-off', beat: 0, value: 0, curve: 'step' },
          { id: 'solo-on', beat: 1, value: 1, curve: 'step' },
        ],
      }],
    };
    localEngine.syncAutomation([soloTrack, second]);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 1]);
    expect(calls.schedules).toHaveLength(1);
    calls.schedules[0].callback(0.5);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 0]);

    localEngine.syncTracks([{ ...first, volume: 0.8 }, second]);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 0]);
    localEngine.syncAutomation([soloTrack, second]);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 0]);

    calls.schedules.length = 0;
    const mutedSoloTrack: Track = {
      ...first,
      automationLanes: [{
        id: 'mute-lane', target: 'track.mute', enabled: true, valueType: 'discrete',
        points: [
          { id: 'mute-off', beat: 0, value: 0, curve: 'step' },
          { id: 'mute-on', beat: 1, value: 1, curve: 'step' },
        ],
      }],
    };
    localEngine.syncAutomation([mutedSoloTrack, second]);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 1]);
    expect(calls.schedules).toHaveLength(1);
    calls.schedules[0].callback(0.5);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([0, 1]);

    localEngine.syncAutomation([{
      ...mutedSoloTrack,
      automationLanes: [{ ...mutedSoloTrack.automationLanes[0], enabled: false }],
    }, second]);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 1]);
    localEngine.syncAutomation([first, second]);
    expect([firstAudibility.value, secondAudibility.value]).toEqual([1, 1]);

    localEngine.syncAutomation([]);
    localEngine.syncTracks([]);
  });
  it('resolves an instrument by descriptor instance ID and merges scheduled parameter values', () => {
    const registry = new PluginRegistry();
    registry.register({
      id: 'example.instrument.test', version: '1.0.0', kind: 'instrument', name: 'Test', description: 'Test instrument',
      parameters: [
        { id: 'attack', name: 'Attack', type: 'number', defaultValue: 0.1, min: 0.01, max: 1, step: 0.01 },
        { id: 'release', name: 'Release', type: 'number', defaultValue: 0.2, min: 0.01, max: 2, step: 0.01 },
      ],
      create: parameters => ({
        node: new Tone.Gain(),
        triggerAttackRelease: vi.fn(),
        setParameters: next => calls.pluginParameters(next),
        dispose: vi.fn(),
      }),
    });
    const localEngine = new AudioEngine(registry);
    const track: Track = {
      id: 'plugin-track', name: 'Plugin Track', type: 'midi', volume: 1, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0,
      instrument: 'synth',
      instrumentPlugin: {
        id: 'instrument-instance', pluginId: 'example.instrument.test', pluginVersion: '1.0.0', enabled: true,
        parameters: { attack: 0.1, release: 0.2 },
      },
      automationLanes: [{
        id: 'attack-lane', target: 'instrument:instrument-instance:attack', label: 'Attack',
        range: { min: 0.01, max: 1 }, valueType: 'continuous', enabled: true,
        points: [
          { id: 'a', beat: 0, value: 0.2, curve: 'linear' },
          { id: 'b', beat: 1, value: 0.8, curve: 'step' },
        ],
      }, {
        id: 'release-lane', target: 'instrument:instrument-instance:release', label: 'Release',
        range: { min: 0.01, max: 2 }, valueType: 'continuous', enabled: true,
        points: [{ id: 'r', beat: 0, value: 0.7, curve: 'step' }],
      }],
    };

    calls.pluginParameters.mockClear();
    localEngine.syncTracks([track]);
    localEngine.syncTempoTrack([{ id: 'tempo', beat: 0, bpm: 120, curve: 'step' }]);
    calls.schedules.length = 0;
    localEngine.syncAutomation([track]);

    expect(calls.pluginParameters).toHaveBeenCalledWith({ attack: 0.2, release: 0.2 });
    expect(calls.pluginParameters).toHaveBeenCalledWith({ attack: 0.2, release: 0.7 });
    const event = calls.schedules.find(item => item.at !== undefined);
    expect(event).toBeDefined();
    event!.callback(10);
    expect(calls.pluginParameters.mock.calls.at(-1)?.[0]).toMatchObject({ release: 0.7 });
    expect(calls.pluginParameters.mock.calls.at(-1)?.[0].attack).toBeGreaterThan(0.2);

    localEngine.syncAutomation([]);
    localEngine.syncTracks([]);
  });

  it('resolves a Track effect parameter by descriptor instance ID', () => {
    const registry = new PluginRegistry();
    registry.register({
      id: 'example.effect.drive', version: '1.0.0', kind: 'effect', name: 'Drive', description: 'Test drive',
      parameters: [{ id: 'drive', name: 'Drive', type: 'number', defaultValue: 0.2, min: 0, max: 1, step: 0.01 }],
      create: () => ({ node: new Tone.Gain(), setParameters: next => calls.pluginParameters(next), dispose: vi.fn() }),
    });
    const localEngine = new AudioEngine(registry);
    const track: Track = {
      id: 'effect-track', name: 'Effect Track', type: 'audio', volume: 1, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0,
      effectPlugins: [{
        id: 'effect-instance', pluginId: 'example.effect.drive', pluginVersion: '1.0.0', enabled: true,
        parameters: { drive: 0.2 },
      }],
      automationLanes: [{
        id: 'drive-lane', target: 'effect:effect-instance:drive', label: 'Drive',
        range: { min: 0, max: 1 }, valueType: 'continuous', enabled: true,
        points: [{ id: 'd', beat: 0, value: 0.75, curve: 'step' }],
      }],
    };

    calls.pluginParameters.mockClear();
    localEngine.syncTracks([track]);
    localEngine.syncAutomation([track]);
    expect(calls.pluginParameters).toHaveBeenCalledWith({ drive: 0.75 });
    localEngine.syncAutomation([]);
    localEngine.syncTracks([]);
  });
});
