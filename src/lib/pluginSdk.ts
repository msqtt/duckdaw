import type * as Tone from 'tone';

export type PluginKind = 'instrument' | 'effect';
export type PluginParameterValue = number | string;

export type PluginParameterDefinition =
  | {
      id: string;
      name: string;
      type: 'number';
      defaultValue: number;
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | {
      id: string;
      name: string;
      type: 'enum';
      defaultValue: string;
      values: readonly string[];
    };

export interface PluginInstanceDescriptor {
  id: string;
  pluginId: string;
  pluginVersion: string;
  enabled: boolean;
  parameters: Record<string, PluginParameterValue>;
}

export interface InstrumentPluginInstance {
  node: Tone.ToneAudioNode;
  triggerAttackRelease: (
    note: string,
    duration: string | number,
    time?: Tone.Unit.Time,
    velocity?: number,
  ) => void;
  setParameters: (parameters: Record<string, PluginParameterValue>) => void;
  dispose: () => void;
}

export interface EffectPluginInstance {
  node: Tone.ToneAudioNode;
  inputNode?: Tone.ToneAudioNode;
  outputNode?: Tone.ToneAudioNode;
  prepareReconnect?: () => void;
  setParameters: (parameters: Record<string, PluginParameterValue>) => void;
  getFrequencyData?: () => Float32Array | undefined;
  dispose: () => void;
}

interface PluginDefinitionBase {
  id: string;
  version: string;
  kind: PluginKind;
  name: string;
  description: string;
  parameters: readonly PluginParameterDefinition[];
}

export interface InstrumentPluginDefinition extends PluginDefinitionBase {
  kind: 'instrument';
  create: (parameters: Record<string, PluginParameterValue>) => InstrumentPluginInstance;
}

export interface EffectPluginDefinition extends PluginDefinitionBase {
  kind: 'effect';
  create: (parameters: Record<string, PluginParameterValue>) => EffectPluginInstance;
}

export type PluginDefinition = InstrumentPluginDefinition | EffectPluginDefinition;

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const PARAMETER_ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function assertDefinition(definition: PluginDefinition, allowReserved: boolean): void {
  if (!PLUGIN_ID_PATTERN.test(definition.id) || definition.id.length > 128) {
    throw new Error(`Invalid plugin ID: ${definition.id}`);
  }
  if (!allowReserved && definition.id.startsWith('duckdaw.')) {
    throw new Error(`Plugin namespace is reserved: ${definition.id}`);
  }
  if (!SEMVER_PATTERN.test(definition.version)) throw new Error(`Invalid plugin version: ${definition.version}`);
  if (definition.kind !== 'instrument' && definition.kind !== 'effect') throw new Error('Invalid plugin kind');
  if (!definition.name.trim() || !definition.description.trim() || typeof definition.create !== 'function') {
    throw new Error('Invalid plugin definition');
  }

  const parameterIds = new Set<string>();
  for (const parameter of definition.parameters) {
    if (!PARAMETER_ID_PATTERN.test(parameter.id) || parameterIds.has(parameter.id) || !parameter.name.trim()) {
      throw new Error(`Invalid or duplicate plugin parameter: ${parameter.id}`);
    }
    parameterIds.add(parameter.id);
    if (parameter.type === 'number') {
      if (![parameter.defaultValue, parameter.min, parameter.max, parameter.step].every(Number.isFinite)
        || parameter.min > parameter.max || parameter.step <= 0
        || parameter.defaultValue < parameter.min || parameter.defaultValue > parameter.max) {
        throw new Error(`Invalid number plugin parameter: ${parameter.id}`);
      }
    } else if (parameter.type === 'enum') {
      if (parameter.values.length === 0 || new Set(parameter.values).size !== parameter.values.length
        || parameter.values.some(value => typeof value !== 'string' || value.length === 0)
        || !parameter.values.includes(parameter.defaultValue)) {
        throw new Error(`Invalid enum plugin parameter: ${parameter.id}`);
      }
    } else {
      throw new Error(`Invalid plugin parameter type: ${(parameter as { type?: unknown }).type}`);
    }
  }
}

export class PluginRegistry {
  private readonly definitions = new Map<string, PluginDefinition>();

  register(definition: PluginDefinition): void {
    this.registerDefinition(definition, false);
  }

  registerBuiltIn(definition: PluginDefinition): void {
    this.registerDefinition(definition, true);
  }

  private registerDefinition(definition: PluginDefinition, allowReserved: boolean): void {
    assertDefinition(definition, allowReserved);
    if (this.definitions.has(definition.id)) throw new Error(`Plugin already registered: ${definition.id}`);
    this.definitions.set(definition.id, definition);
  }

  get(id: string): PluginDefinition | undefined {
    return this.definitions.get(id);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(kind?: PluginKind): readonly PluginDefinition[] {
    return [...this.definitions.values()]
      .filter(definition => kind == null || definition.kind === kind)
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}

export const duckDawPluginRegistry = new PluginRegistry();

export function registerDuckDawPlugin(definition: PluginDefinition): void {
  duckDawPluginRegistry.register(definition);
}

function cloneParameters(parameters: Record<string, PluginParameterValue>): Record<string, PluginParameterValue> {
  return Object.fromEntries(Object.entries(parameters));
}

export function validatePluginDescriptor(value: unknown): asserts value is PluginInstanceDescriptor {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plugin descriptor');
  const descriptor = value as Partial<PluginInstanceDescriptor>;
  if (typeof descriptor.id !== 'string' || descriptor.id.length === 0
    || typeof descriptor.pluginId !== 'string' || !PLUGIN_ID_PATTERN.test(descriptor.pluginId)
    || typeof descriptor.pluginVersion !== 'string' || !SEMVER_PATTERN.test(descriptor.pluginVersion)
    || typeof descriptor.enabled !== 'boolean'
    || descriptor.parameters == null || typeof descriptor.parameters !== 'object' || Array.isArray(descriptor.parameters)) {
    throw new Error('Invalid plugin descriptor');
  }
  for (const [key, parameter] of Object.entries(descriptor.parameters)) {
    if (!PARAMETER_ID_PATTERN.test(key)) throw new Error(`Invalid plugin parameter: ${key}`);
    if (typeof parameter === 'number') {
      if (!Number.isFinite(parameter)) throw new Error(`Plugin parameter must be finite: ${key}`);
    } else if (typeof parameter !== 'string') {
      throw new Error(`Invalid plugin parameter: ${key}`);
    }
  }
}

function normalizeNumber(value: unknown, parameter: Extract<PluginParameterDefinition, { type: 'number' }>): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return parameter.defaultValue;
  const clamped = Math.min(parameter.max, Math.max(parameter.min, value));
  const steps = Math.round((clamped - parameter.min) / parameter.step);
  const quantized = parameter.min + steps * parameter.step;
  const precision = Math.max(0, (String(parameter.step).split('.')[1] ?? '').length);
  return Math.min(parameter.max, Math.max(parameter.min, Number(quantized.toFixed(precision + 2))));
}

export function normalizePluginDescriptor(
  value: PluginInstanceDescriptor,
  definition?: PluginDefinition,
): PluginInstanceDescriptor {
  validatePluginDescriptor(value);
  if (definition != null && definition.id !== value.pluginId) throw new Error('Plugin definition does not match descriptor');
  const parameters = cloneParameters(value.parameters);
  if (definition != null) {
    for (const parameter of definition.parameters) {
      if (parameter.type === 'number') parameters[parameter.id] = normalizeNumber(parameters[parameter.id], parameter);
      else parameters[parameter.id] = typeof parameters[parameter.id] === 'string'
        && parameter.values.includes(parameters[parameter.id] as string)
        ? parameters[parameter.id]
        : parameter.defaultValue;
    }
  }
  return { ...value, parameters };
}

export function createPluginDescriptor(
  definition: PluginDefinition,
  id: string = crypto.randomUUID(),
): PluginInstanceDescriptor {
  return {
    id,
    pluginId: definition.id,
    pluginVersion: definition.version,
    enabled: true,
    parameters: Object.fromEntries(definition.parameters.map(parameter => [parameter.id, parameter.defaultValue])),
  };
}

const LEGACY_INSTRUMENT_IDS: Record<string, string> = {
  synth: 'duckdaw.instrument.synth',
  piano: 'duckdaw.instrument.keys',
  bass: 'duckdaw.instrument.bass',
  drum: 'duckdaw.instrument.drums',
};

const LEGACY_EFFECT_IDS: Record<string, string> = {
  reverb: 'duckdaw.effect.reverb',
  delay: 'duckdaw.effect.delay',
  limiter: 'duckdaw.effect.limiter',
};

export function legacyInstrumentToPluginDescriptor(
  instrument: string | undefined,
  envelope: { attack: number; decay: number; sustain: number; release: number } | undefined,
  id: string = crypto.randomUUID(),
): PluginInstanceDescriptor {
  return {
    id,
    pluginId: LEGACY_INSTRUMENT_IDS[instrument ?? 'synth'] ?? LEGACY_INSTRUMENT_IDS.synth,
    pluginVersion: '1.0.0',
    enabled: true,
    parameters: envelope == null ? {} : { ...envelope },
  };
}

export function legacyEffectToPluginDescriptor(
  effect: { id: string; type: string; enabled: boolean; parameters: Record<string, number> },
): PluginInstanceDescriptor {
  return {
    id: effect.id,
    pluginId: LEGACY_EFFECT_IDS[effect.type] ?? `legacy.effect.${effect.type}`,
    pluginVersion: '1.0.0',
    enabled: effect.enabled,
    parameters: { ...effect.parameters },
  };
}

export function pluginInstrumentToLegacyType(pluginId: string): 'piano' | 'synth' | 'bass' | 'drum' {
  if (pluginId === LEGACY_INSTRUMENT_IDS.piano) return 'piano';
  if (pluginId === LEGACY_INSTRUMENT_IDS.bass) return 'bass';
  if (pluginId === LEGACY_INSTRUMENT_IDS.drum) return 'drum';
  return 'synth';
}

export function pluginEffectToLegacyType(pluginId: string): 'reverb' | 'delay' | 'limiter' | undefined {
  return Object.entries(LEGACY_EFFECT_IDS).find(([, id]) => id === pluginId)?.[0] as
    | 'reverb' | 'delay' | 'limiter' | undefined;
}

export function normalizePluginChain(value: unknown): PluginInstanceDescriptor[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid plugin chain');
  const ids = new Set<string>();
  return value.map(item => {
    validatePluginDescriptor(item);
    if (ids.has(item.id)) throw new Error(`Duplicate plugin instance ID: ${item.id}`);
    ids.add(item.id);
    return normalizePluginDescriptor(item);
  });
}
