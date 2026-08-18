import { describe, expect, it, vi } from 'vitest';

const disposed = vi.hoisted(() => ({ gain: vi.fn(), channel: vi.fn() }));

vi.mock('tone', () => {
  class Param {
    value = 0;
    cancelScheduledValues() {}
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    setValueCurveAtTime() {}
  }
  class BaseNode {
    connections: unknown[] = [];
    connect(node: unknown) { this.connections.push(node); return this; }
    disconnect() { this.connections = []; return this; }
    chain(...nodes: unknown[]) { this.connections.push(...nodes); return this; }
    toDestination() { return this; }
    dispose() {}
  }
  class Gain extends BaseNode {
    gain = new Param();
    constructor(value = 1) { super(); this.gain.value = value; }
    dispose() { disposed.gain(); }
  }
  class Channel extends BaseNode {
    volume = new Param(); pan = new Param(); mute = false; solo = false;
    dispose() { disposed.channel(); }
  }
  class Wet extends BaseNode { wet = new Param(); }
  return {
    Gain, Channel,
    Meter: class extends BaseNode { getValue() { return -60; } },
    Reverb: class extends Wet {}, FeedbackDelay: class extends Wet {}, Limiter: class extends BaseNode {},
    PolySynth: class extends BaseNode { set() {}; triggerAttackRelease() {} },
    Synth: class extends BaseNode {}, Sampler: class extends BaseNode {},
    MembraneSynth: class extends BaseNode { triggerAttackRelease() {} },
    Player: class extends BaseNode {}, Part: class extends BaseNode { start() {} },
    Loop: class extends BaseNode { start() {}; stop() {} }, UserMedia: class extends BaseNode {},
    Destination: { connect: vi.fn(), volume: new Param() },
    Transport: {
      bpm: { value: 120, cancelScheduledValues() {}, setValueAtTime() {}, linearRampTo() {} },
      timeSignature: [4, 4], position: '0:0:0', loop: false,
      schedule: vi.fn(() => 1), scheduleOnce: vi.fn(() => 2), clear: vi.fn(),
      start: vi.fn(), stop: vi.fn(), pause: vi.fn(),
    },
    context: { state: 'running', resume: vi.fn(), createMediaStreamDestination: () => ({ stream: {} }) },
    start: vi.fn(),
  };
});

import { engine } from './audioEngine';
import { buildMixGraphPlan } from './mixGraph';
import type { Track } from '../store/dawStore';
import type { Bus, Send } from './routingGraph';

describe('AudioEngine shared routing runtime', () => {
  it('instantiates the exact shared graph and releases obsolete send/bus nodes', () => {
    const tracks: Track[] = [{
      id: 'track', name: 'Track', type: 'audio', volume: 1, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0,
      automationLanes: [], outputBusId: 'group',
    }];
    const buses: Bus[] = [
      { id: 'master', name: 'Master', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: null },
      { id: 'group', name: 'Group', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: 'master' },
    ];
    const sends: Send[] = [{ id: 'send', sourceTrackId: 'track', targetBusId: 'master', gain: 0.25, preFader: true }];

    engine.syncTracks(tracks);
    engine.syncRouting(tracks, buses, sends);
    expect(engine.getRoutingPlan()).toEqual(buildMixGraphPlan(tracks as Array<Track & { outputBusId: string }>, buses, sends));
    expect(engine.sendGains.size).toBe(1);
    expect(engine.busChannels.size).toBe(2);

    engine.syncRouting(tracks, buses, []);
    expect(engine.sendGains.size).toBe(0);
    expect(disposed.gain).toHaveBeenCalled();
  });
});
