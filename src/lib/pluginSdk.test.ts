import { describe, expect, it, vi } from 'vitest';
import {
  PluginRegistry,
  createPluginDescriptor,
  legacyEffectToPluginDescriptor,
  legacyInstrumentToPluginDescriptor,
  normalizePluginDescriptor,
  validatePluginDescriptor,
  type EffectPluginDefinition,
  type InstrumentPluginDefinition,
} from './pluginSdk';
import { createBuiltInPluginRegistry } from './builtinPlugins';

const instrument = (id = 'vendor.instrument.test'): InstrumentPluginDefinition => ({
  id,
  version: '1.2.3',
  kind: 'instrument',
  name: 'Test Instrument',
  description: 'Test instrument definition',
  parameters: [
    { id: 'gain', name: 'Gain', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.1 },
    { id: 'wave', name: 'Wave', type: 'enum', defaultValue: 'sine', values: ['sine', 'square'] },
  ],
  create: vi.fn(() => ({
    node: {} as any,
    triggerAttackRelease: vi.fn(),
    setParameters: vi.fn(),
    dispose: vi.fn(),
  })),
});

const effect = (id = 'vendor.effect.test'): EffectPluginDefinition => ({
  id,
  version: '2.0.0',
  kind: 'effect',
  name: 'Test Effect',
  description: 'Test effect definition',
  parameters: [
    { id: 'wet', name: 'Wet', type: 'number', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
  ],
  create: vi.fn(() => ({
    node: {} as any,
    setParameters: vi.fn(),
    dispose: vi.fn(),
  })),
});

describe('PluginRegistry', () => {
  it('registers and deterministically lists instrument/effect definitions', () => {
    const registry = new PluginRegistry();
    registry.register(effect('vendor.effect.zeta'));
    registry.register(instrument('vendor.instrument.alpha'));
    registry.register(instrument('vendor.instrument.beta'));

    expect(registry.get('vendor.instrument.alpha')?.kind).toBe('instrument');
    expect(registry.list('instrument').map(item => item.id)).toEqual([
      'vendor.instrument.alpha',
      'vendor.instrument.beta',
    ]);
    expect(registry.list('effect').map(item => item.id)).toEqual(['vendor.effect.zeta']);
  });

  it('rejects duplicate, reserved, malformed and internally invalid definitions atomically', () => {
    const registry = new PluginRegistry();
    registry.register(instrument());

    expect(() => registry.register(instrument())).toThrow(/already registered/i);
    expect(() => registry.register(instrument('duckdaw.instrument.third-party'))).toThrow(/reserved/i);
    expect(() => registry.register(instrument('invalid'))).toThrow(/plugin id/i);
    expect(() => registry.register({ ...instrument('vendor.instrument.bad-version'), version: 'latest' })).toThrow(/version/i);
    expect(() => registry.register({
      ...instrument('vendor.instrument.duplicate-parameter'),
      parameters: [
        { id: 'gain', name: 'Gain', type: 'number' as const, defaultValue: 0.5, min: 0, max: 1, step: 0.1 },
        { id: 'gain', name: 'Gain 2', type: 'number' as const, defaultValue: 0.5, min: 0, max: 1, step: 0.1 },
      ],
    })).toThrow(/parameter/i);
    expect(registry.list()).toHaveLength(1);
  });

  it('allows the reserved namespace only for explicitly trusted built-ins', () => {
    const registry = new PluginRegistry();
    registry.registerBuiltIn(instrument('duckdaw.instrument.test'));
    expect(registry.get('duckdaw.instrument.test')).toBeDefined();
  });
});

describe('plugin descriptors and parameters', () => {
  it('creates defaults and normalizes numbers, steps, enum values without mutating input', () => {
    const definition = instrument();
    expect(createPluginDescriptor(definition, 'instance-1')).toEqual({
      id: 'instance-1',
      pluginId: definition.id,
      pluginVersion: definition.version,
      enabled: true,
      parameters: { gain: 0.5, wave: 'sine' },
    });

    const source = {
      id: 'instance-2',
      pluginId: definition.id,
      pluginVersion: '1.0.0',
      enabled: false,
      parameters: { gain: 1.26, wave: 'invalid', future: 'keep-me' },
    };
    const before = structuredClone(source);
    expect(normalizePluginDescriptor(source, definition)).toEqual({
      ...source,
      parameters: { gain: 1, wave: 'sine', future: 'keep-me' },
    });
    expect(source).toEqual(before);
  });

  it('rejects unsafe descriptor shapes but permits unknown primitive parameters', () => {
    expect(() => validatePluginDescriptor({
      id: 'unknown-1',
      pluginId: 'vendor.effect.missing',
      pluginVersion: '1.0.0',
      enabled: true,
      parameters: { amount: 0.5, mode: 'wide' },
    })).not.toThrow();
    expect(() => validatePluginDescriptor({
      id: 'unknown-2',
      pluginId: 'vendor.effect.missing',
      pluginVersion: '1.0.0',
      enabled: true,
      parameters: { nested: { unsafe: true } },
    })).toThrow(/parameter/i);
    expect(() => validatePluginDescriptor({
      id: 'unknown-3',
      pluginId: 'vendor.effect.missing',
      pluginVersion: '1.0.0',
      enabled: true,
      parameters: { amount: Number.NaN },
    })).toThrow(/finite/i);
  });
});

describe('legacy plugin migration', () => {
  it.each([
    ['synth', 'duckdaw.instrument.synth'],
    ['piano', 'duckdaw.instrument.keys'],
    ['bass', 'duckdaw.instrument.bass'],
    ['drum', 'duckdaw.instrument.drums'],
  ] as const)('maps %s to %s and carries envelope parameters', (legacy, pluginId) => {
    const descriptor = legacyInstrumentToPluginDescriptor(legacy, {
      attack: 0.2,
      decay: 0.4,
      sustain: 0.6,
      release: 0.8,
    }, `legacy-${legacy}`);
    expect(descriptor).toMatchObject({
      id: `legacy-${legacy}`,
      pluginId,
      pluginVersion: '1.0.0',
      enabled: true,
      parameters: { attack: 0.2, decay: 0.4, sustain: 0.6, release: 0.8 },
    });
  });

  it.each([
    ['reverb', 'duckdaw.effect.reverb'],
    ['delay', 'duckdaw.effect.delay'],
    ['limiter', 'duckdaw.effect.limiter'],
  ] as const)('maps legacy %s effects to %s', (legacy, pluginId) => {
    expect(legacyEffectToPluginDescriptor({
      id: `legacy-${legacy}`,
      type: legacy,
      enabled: true,
      parameters: { wet: 0.4 },
    })).toEqual({
      id: `legacy-${legacy}`,
      pluginId,
      pluginVersion: '1.0.0',
      enabled: true,
      parameters: { wet: 0.4 },
    });
  });
});

describe('built-in plugin catalog', () => {
  it('contains five instruments and five effects with stable IDs', () => {
    const registry = createBuiltInPluginRegistry();
    expect(registry.list('instrument').map(item => item.id)).toEqual([
      'duckdaw.instrument.bass',
      'duckdaw.instrument.drums',
      'duckdaw.instrument.keys',
      'duckdaw.instrument.pluck',
      'duckdaw.instrument.synth',
    ]);
    expect(registry.list('effect').map(item => item.id)).toEqual([
      'duckdaw.effect.chorus',
      'duckdaw.effect.delay',
      'duckdaw.effect.distortion',
      'duckdaw.effect.limiter',
      'duckdaw.effect.reverb',
    ]);
  });
});
