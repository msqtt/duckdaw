const fftState = vi.hoisted(() => ({
  unavailable: false,
  connectFailure: false,
  instances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));
import { describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => {
  class Param { value = 0; cancelScheduledValues() {}; setValueAtTime() {}; linearRampToValueAtTime() {}; exponentialRampToValueAtTime() {}; setValueCurveAtTime() {} }
  class BaseNode {
    connections: unknown[] = [];
    connect(node: unknown) {
      if (fftState.connectFailure && (node as { isMockFft?: boolean }).isMockFft) throw new Error('FFT connect failed');
      this.connections.push(node);
      return this;
    }
    disconnect() { this.connections = []; return this; }
    chain(...nodes: unknown[]) { this.connections.push(...nodes); return this; }
    toDestination() { return this; }
    dispose = vi.fn();
  }
  class Gain extends BaseNode { gain = new Param(); constructor(value = 1) { super(); this.gain.value = value; } }
  class Channel extends BaseNode { volume = new Param(); pan = new Param(); mute = false; solo = false; }
  class Wet extends BaseNode { wet = new Param(); }
  return {
    Gain, Channel,
    Meter: class extends BaseNode { getValue() { return -60; } },
    Reverb: class extends Wet {},
    FeedbackDelay: class extends Wet { delayTime = new Param(); feedback = new Param(); },
    Limiter: class extends BaseNode { threshold = new Param(); },
    Distortion: class extends Wet { distortion = 0; },
    Chorus: class extends Wet { frequency = new Param(); delayTime = 0; depth = 0; start() { return this; } },
    Filter: class extends BaseNode { frequency = new Param(); gain = new Param(); Q = new Param(); },
    FFT: class extends BaseNode {
      isMockFft = true;
      constructor() {
        super();
        if (fftState.unavailable) throw new Error('FFT unavailable');
        fftState.instances.push(this);
      }
      getValue() { return new Float32Array(256).fill(-100); }
    },
    PolySynth: class extends BaseNode { set() {}; triggerAttackRelease() {} },
    Player: class extends BaseNode {},
    Synth: class extends BaseNode { set() {}; triggerAttackRelease() {} },
    Sampler: class extends BaseNode { set() {}; triggerAttackRelease() {} },
    PluckSynth: class extends BaseNode { set() {}; triggerAttackRelease() {} },
    MembraneSynth: class extends BaseNode { triggerAttackRelease() {} },
    Part: class extends BaseNode {
      constructor(public callback: (time: number, value: any) => void, public events: any[]) { super(); }
      start() { return this; }
    },
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

import { AudioEngine } from './audioEngine';
import { PluginRegistry, type EffectPluginInstance, type InstrumentPluginInstance } from './pluginSdk';
import { createBuiltInPluginRegistry } from './builtinPlugins';
import type { Clip, Track } from '../store/dawStore';
import type { Bus } from './routingGraph';

const node = () => ({ connections: [] as unknown[], connect(target: unknown) { this.connections.push(target); return this; }, disconnect: vi.fn(), dispose: vi.fn() });

describe('AudioEngine plugin call chain', () => {
  it('creates, reconnects and disposes track plugins through registry factories', () => {
    const instruments: InstrumentPluginInstance[] = [];
    const effects: EffectPluginInstance[] = [];
    const registry = new PluginRegistry();
    registry.registerBuiltIn({
      id: 'duckdaw.instrument.synth', version: '1.0.0', kind: 'instrument', name: 'Fallback', description: 'fallback', parameters: [],
      create: () => ({ node: node() as any, triggerAttackRelease: vi.fn(), setParameters: vi.fn(), dispose: vi.fn() }),
    });
    registry.register({
      id: 'vendor.instrument.live', version: '1.0.0', kind: 'instrument', name: 'Live', description: 'live instrument',
      parameters: [{ id: 'tone', name: 'Tone', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.1 }],
      create: parameters => {
        const instance = { node: node() as any, triggerAttackRelease: vi.fn(), setParameters: vi.fn(), dispose: vi.fn() };
        instruments.push(instance);
        expect(parameters.tone).toBeTypeOf('number');
        return instance;
      },
    });
    registry.register({
      id: 'vendor.effect.live', version: '1.0.0', kind: 'effect', name: 'FX', description: 'live effect',
      parameters: [{ id: 'wet', name: 'Wet', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.1 }],
      create: () => {
        const instance = { node: node() as any, setParameters: vi.fn(), dispose: vi.fn() };
        effects.push(instance);
        return instance;
      },
    });
    const audio = new AudioEngine(registry);
    const base: Track = {
      id: 'track', name: 'Track', type: 'midi', volume: 1, pan: 0, isMuted: false, isSolo: false,
      color: '#fff', reverb: 0, delay: 0, instrument: 'synth', automationLanes: [],
      instrumentPlugin: { id: 'inst', pluginId: 'vendor.instrument.live', pluginVersion: '1.0.0', enabled: true, parameters: { tone: 0.4 } },
      effectPlugins: [{ id: 'fx', pluginId: 'vendor.effect.live', pluginVersion: '1.0.0', enabled: true, parameters: { wet: 0.3 } }],
    };

    audio.syncTracks([base]);
    expect(instruments).toHaveLength(1);
    expect(effects).toHaveLength(1);
    const clip: Clip = {
      id: 'plugin-clip', trackId: base.id, arrangementId: 'main', type: 'midi', start: 0, duration: 4,
      notes: [{ id: 'note', note: 'C4', start: 0, duration: 1, velocity: 0.75 }],
    };
    audio.syncClips([clip]);
    const part = audio.partMap.get(clip.id) as any;
    part.callback(0, part.events[0]);
    expect(instruments[0].triggerAttackRelease).toHaveBeenCalledWith('C4', '0:1', 0, 0.75);

    audio.syncTracks([structuredClone(base)]);
    expect(instruments).toHaveLength(1);
    expect(effects).toHaveLength(1);

    audio.syncTracks([{ ...base, instrumentPlugin: { ...base.instrumentPlugin!, parameters: { tone: 0.9 } }, effectPlugins: [{ ...base.effectPlugins![0], parameters: { wet: 0.8 } }] }]);
    expect(instruments).toHaveLength(2);
    expect(effects).toHaveLength(2);
    expect(instruments[0].dispose).toHaveBeenCalledOnce();
    expect(effects[0].dispose).toHaveBeenCalledOnce();

    audio.syncTracks([]);
    expect(instruments[1].dispose).toHaveBeenCalledOnce();
    expect(effects[1].dispose).toHaveBeenCalledOnce();
  });

  it('uses the same effect factory for bus chains and bypasses missing plugins', () => {
    const created: EffectPluginInstance[] = [];
    const registry = new PluginRegistry();
    registry.registerBuiltIn({
      id: 'duckdaw.instrument.synth', version: '1.0.0', kind: 'instrument', name: 'Fallback', description: 'fallback', parameters: [],
      create: () => ({ node: node() as any, triggerAttackRelease: vi.fn(), setParameters: vi.fn(), dispose: vi.fn() }),
    });
    registry.register({
      id: 'vendor.effect.bus', version: '1.0.0', kind: 'effect', name: 'Bus FX', description: 'bus effect', parameters: [],
      create: () => {
        const instance = { node: node() as any, setParameters: vi.fn(), dispose: vi.fn() };
        created.push(instance);
        return instance;
      },
    });
    const audio = new AudioEngine(registry);
    const buses: Bus[] = [{
      id: 'master', name: 'Master', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: null,
      effectPlugins: [
        { id: 'known', pluginId: 'vendor.effect.bus', pluginVersion: '1.0.0', enabled: true, parameters: {} },
        { id: 'unknown', pluginId: 'vendor.effect.missing', pluginVersion: '1.0.0', enabled: true, parameters: {} },
      ],
    }];

    audio.syncRouting([], buses, []);
    expect(created).toHaveLength(1);
    audio.syncRouting([], buses, []);
    expect(created).toHaveLength(2);
    expect(created[0].dispose).toHaveBeenCalledOnce();
  });

  it('keeps the parametric EQ processing chain active when FFT analysis is unavailable', () => {
    const registry = createBuiltInPluginRegistry();
    const definition = registry.get('duckdaw.effect.parametric-eq');
    expect(definition?.kind).toBe('effect');
    const parameters = Object.fromEntries(definition!.parameters.map(parameter => [parameter.id, parameter.defaultValue]));
    fftState.unavailable = true;
    try {
      const instance = (definition as any).create(parameters) as EffectPluginInstance;
      expect(instance.node).toBeDefined();
      expect(instance.outputNode).toBeDefined();
      expect(instance.getFrequencyData?.()).toBeUndefined();
      expect(() => instance.setParameters({ ...parameters, band1Gain: 6 })).not.toThrow();
      instance.dispose();
    } finally {
      fftState.unavailable = false;
    }
  });

  it('creates, triggers when applicable, and idempotently disposes all built-in instruments and effects', () => {
    const registry = createBuiltInPluginRegistry();
    expect(registry.list('instrument')).toHaveLength(5);
    expect(registry.list('effect')).toHaveLength(6);

    for (const definition of registry.list()) {
      const parameters = Object.fromEntries(definition.parameters.map(parameter => [parameter.id, parameter.defaultValue]));
      const instance = definition.create(parameters) as InstrumentPluginInstance | EffectPluginInstance;
      expect(instance.node).toBeDefined();
      if (definition.kind === 'instrument') {
        (instance as InstrumentPluginInstance).triggerAttackRelease('C4', 0.1, 0, 0.5);
      }
      expect(() => {
        instance.dispose();
        instance.dispose();
      }).not.toThrow();
    }
  });

  it('disposes a constructed FFT when the analysis branch cannot connect', () => {
    const registry = createBuiltInPluginRegistry();
    const definition = registry.get('duckdaw.effect.parametric-eq');
    const parameters = Object.fromEntries(definition!.parameters.map(parameter => [parameter.id, parameter.defaultValue]));
    const start = fftState.instances.length;
    fftState.connectFailure = true;
    try {
      const instance = (definition as any).create(parameters) as EffectPluginInstance;
      const analyser = fftState.instances[start];
      expect(instance.node).toBeDefined();
      expect(instance.outputNode).toBeDefined();
      expect(instance.getFrequencyData?.()).toBeUndefined();
      expect(analyser.dispose).toHaveBeenCalledOnce();
      expect(() => instance.setParameters({ ...parameters, band1Gain: 6 })).not.toThrow();
      instance.dispose();
      expect(analyser.dispose).toHaveBeenCalledOnce();
    } finally {
      fftState.connectFailure = false;
    }
  });
});
