import { installBuiltInPlugins } from './builtinPlugins';
import {
  duckDawPluginRegistry,
  normalizePluginDescriptor,
  type EffectPluginDefinition,
  type EffectPluginInstance,
  type InstrumentPluginDefinition,
  type InstrumentPluginInstance,
  type PluginInstanceDescriptor,
  type PluginRegistry,
} from './pluginSdk';

export interface InstantiatedInstrumentPlugin {
  descriptor: PluginInstanceDescriptor;
  definition: InstrumentPluginDefinition;
  instance: InstrumentPluginInstance;
  usedFallback: boolean;
}

export interface InstantiatedEffectPlugin {
  descriptor: PluginInstanceDescriptor;
  definition: EffectPluginDefinition;
  instance: EffectPluginInstance;
}

export function getDefaultPluginRegistry(): PluginRegistry {
  return installBuiltInPlugins(duckDawPluginRegistry);
}

export type PluginErrorHandler = (error: unknown, descriptor: PluginInstanceDescriptor) => void;

const reportPluginError: PluginErrorHandler = (error, descriptor) => {
  console.error(`DuckDAW plugin failed: ${descriptor.pluginId}`, error);
};

export function instantiateInstrumentPlugin(
  descriptor: PluginInstanceDescriptor,
  registry: PluginRegistry = getDefaultPluginRegistry(),
  onError: PluginErrorHandler = reportPluginError,
): InstantiatedInstrumentPlugin | null {
  const requested = registry.get(descriptor.pluginId);
  const requestedInstrument = descriptor.enabled && requested?.kind === 'instrument'
    ? requested
    : undefined;

  const attempt = (
    definition: InstrumentPluginDefinition,
    usedFallback: boolean,
  ): InstantiatedInstrumentPlugin | null => {
    try {
      const normalized = normalizePluginDescriptor({
        ...descriptor,
        pluginId: definition.id,
        pluginVersion: definition.version,
      }, definition);
      return {
        descriptor,
        definition,
        instance: definition.create(normalized.parameters),
        usedFallback,
      };
    } catch (error) {
      onError(error, descriptor);
      return null;
    }
  };

  if (requestedInstrument != null) {
    const requestedResult = attempt(requestedInstrument, false);
    if (requestedResult != null) return requestedResult;
  }
  const fallback = registry.get('duckdaw.instrument.synth');
  if (fallback?.kind !== 'instrument') {
    onError(new Error('DuckDAW synth fallback plugin is not registered'), descriptor);
    return null;
  }
  if (requestedInstrument?.id === fallback.id) return null;
  return attempt(fallback, true);
}

export function instantiateEffectPlugin(
  descriptor: PluginInstanceDescriptor,
  registry: PluginRegistry = getDefaultPluginRegistry(),
  onError: PluginErrorHandler = reportPluginError,
): InstantiatedEffectPlugin | null {
  if (!descriptor.enabled) return null;
  const definition = registry.get(descriptor.pluginId);
  if (definition?.kind !== 'effect') return null;
  try {
    const normalized = normalizePluginDescriptor(descriptor, definition);
    return {
      descriptor,
      definition,
      instance: definition.create(normalized.parameters),
    };
  } catch (error) {
    onError(error, descriptor);
    return null;
  }
}

export function instantiateEffectChain(
  descriptors: readonly PluginInstanceDescriptor[],
  registry: PluginRegistry = getDefaultPluginRegistry(),
  onError: PluginErrorHandler = reportPluginError,
): InstantiatedEffectPlugin[] {
  const instances: InstantiatedEffectPlugin[] = [];
  try {
    for (const descriptor of descriptors) {
      const plugin = instantiateEffectPlugin(descriptor, registry, onError);
      if (plugin != null) instances.push(plugin);
    }
    return instances;
  } catch (error) {
    for (const plugin of instances) plugin.instance.dispose();
    throw error;
  }
}

export function disposePluginInstances(
  instances: readonly { dispose: () => void }[],
): void {
  for (const instance of instances) instance.dispose();
}
