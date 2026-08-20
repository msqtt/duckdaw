import { describe, expect, it, vi } from 'vitest';
import {
  PluginRegistry,
  type EffectPluginDefinition,
  type InstrumentPluginDefinition,
  type PluginInstanceDescriptor,
} from './pluginSdk';
import {
  instantiateEffectChain,
  instantiateEffectPlugin,
  instantiateInstrumentPlugin,
} from './pluginRuntime';

const descriptor = (pluginId: string, parameters: Record<string, number | string> = {}): PluginInstanceDescriptor => ({
  id: `instance-${pluginId}`,
  pluginId,
  pluginVersion: '1.0.0',
  enabled: true,
  parameters,
});

const fakeInstrument = (id: string, create = vi.fn()): InstrumentPluginDefinition => ({
  id, version: '1.0.0', kind: 'instrument', name: id, description: 'test instrument',
  parameters: [{ id: 'gain', name: 'Gain', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.1 }],
  create: create as InstrumentPluginDefinition['create'],
});

const fakeEffect = (id: string, create = vi.fn()): EffectPluginDefinition => ({
  id, version: '1.0.0', kind: 'effect', name: id, description: 'test effect',
  parameters: [{ id: 'wet', name: 'Wet', type: 'number', defaultValue: 0.25, min: 0, max: 1, step: 0.1 }],
  create: create as EffectPluginDefinition['create'],
});

describe('shared plugin runtime factory', () => {
  it('uses the registered definition and normalized parameters for instruments', () => {
    const create = vi.fn(() => ({ node: {} as any, triggerAttackRelease: vi.fn(), setParameters: vi.fn(), dispose: vi.fn() }));
    const registry = new PluginRegistry();
    registry.register(fakeInstrument('vendor.instrument.runtime', create));

    const result = instantiateInstrumentPlugin(descriptor('vendor.instrument.runtime', { gain: 1.26 }), registry);

    expect(result?.usedFallback).toBe(false);
    expect(result?.definition.id).toBe('vendor.instrument.runtime');
    expect(create).toHaveBeenCalledWith({ gain: 1 });
  });

  it('falls back to the built-in synth for unknown or wrong-kind instruments', () => {
    const fallbackCreate = vi.fn(() => ({ node: {} as any, triggerAttackRelease: vi.fn(), setParameters: vi.fn(), dispose: vi.fn() }));
    const registry = new PluginRegistry();
    registry.registerBuiltIn(fakeInstrument('duckdaw.instrument.synth', fallbackCreate));
    registry.register(fakeEffect('vendor.effect.not-an-instrument'));

    expect(instantiateInstrumentPlugin(descriptor('vendor.instrument.missing'), registry)?.usedFallback).toBe(true);
    expect(instantiateInstrumentPlugin(descriptor('vendor.effect.not-an-instrument'), registry)?.usedFallback).toBe(true);
    expect(fallbackCreate).toHaveBeenCalledTimes(2);
  });

  it('bypasses disabled, unknown and wrong-kind effects without executing a factory', () => {
    const effectCreate = vi.fn(() => ({ node: {} as any, setParameters: vi.fn(), dispose: vi.fn() }));
    const instrumentCreate = vi.fn();
    const registry = new PluginRegistry();
    registry.register(fakeEffect('vendor.effect.runtime', effectCreate));
    registry.register(fakeInstrument('vendor.instrument.not-an-effect', instrumentCreate));

    expect(instantiateEffectPlugin({ ...descriptor('vendor.effect.runtime'), enabled: false }, registry)).toBeNull();
    expect(instantiateEffectPlugin(descriptor('vendor.effect.missing'), registry)).toBeNull();
    expect(instantiateEffectPlugin(descriptor('vendor.instrument.not-an-effect'), registry)).toBeNull();
    expect(effectCreate).not.toHaveBeenCalled();

    expect(instantiateEffectPlugin(descriptor('vendor.effect.runtime', { wet: 0.76 }), registry)?.definition.id)
      .toBe('vendor.effect.runtime');
    expect(effectCreate).toHaveBeenCalledWith({ wet: 0.8 });
    expect(instrumentCreate).not.toHaveBeenCalled();
  });

  it('falls back after an instrument factory throws and returns silence only if fallback also fails', () => {
    const requestedError = new Error('instrument failed');
    const fallbackError = new Error('fallback failed');
    const fallbackCreate = vi.fn(() => ({ node: {} as any, triggerAttackRelease: vi.fn(), setParameters: vi.fn(), dispose: vi.fn() }));
    const onError = vi.fn();
    const registry = new PluginRegistry();
    registry.registerBuiltIn(fakeInstrument('duckdaw.instrument.synth', fallbackCreate));
    registry.register(fakeInstrument('vendor.instrument.throwing', vi.fn(() => { throw requestedError; })));

    const recovered = instantiateInstrumentPlugin(descriptor('vendor.instrument.throwing'), registry, onError);
    expect(recovered?.usedFallback).toBe(true);
    expect(recovered?.definition.id).toBe('duckdaw.instrument.synth');
    expect(onError).toHaveBeenCalledWith(requestedError, expect.objectContaining({ pluginId: 'vendor.instrument.throwing' }));

    const brokenRegistry = new PluginRegistry();
    brokenRegistry.registerBuiltIn(fakeInstrument('duckdaw.instrument.synth', vi.fn(() => { throw fallbackError; })));
    expect(instantiateInstrumentPlugin(descriptor('vendor.instrument.missing'), brokenRegistry, onError)).toBeNull();
    expect(onError).toHaveBeenCalledWith(fallbackError, expect.objectContaining({ pluginId: 'vendor.instrument.missing' }));
  });

  it('bypasses a throwing effect factory and continues the ordered chain', () => {
    const created: string[] = [];
    const onError = vi.fn();
    const registry = new PluginRegistry();
    const good = (id: string): EffectPluginDefinition => ({
      ...fakeEffect(id),
      create: () => {
        created.push(id);
        return { node: {} as any, setParameters: vi.fn(), dispose: vi.fn() };
      },
    });
    registry.register(good('vendor.effect.first'));
    registry.register(fakeEffect('vendor.effect.throwing', vi.fn(() => { throw new Error('effect failed'); })));
    registry.register(good('vendor.effect.last'));

    const chain = instantiateEffectChain([
      descriptor('vendor.effect.first'),
      descriptor('vendor.effect.throwing'),
      descriptor('vendor.effect.last'),
    ], registry, onError);

    expect(chain.map(plugin => plugin.definition.id)).toEqual(['vendor.effect.first', 'vendor.effect.last']);
    expect(created).toEqual(['vendor.effect.first', 'vendor.effect.last']);
    expect(onError).toHaveBeenCalledOnce();
  });
});
