import * as Tone from 'tone';
import {
  createEqParameterDefinitions,
  readEqBands,
} from './parametricEq';
import {
  PluginRegistry,
  duckDawPluginRegistry,
  type EffectPluginDefinition,
  type EffectPluginInstance,
  type InstrumentPluginDefinition,
  type InstrumentPluginInstance,
  type PluginParameterDefinition,
  type PluginParameterValue,
} from './pluginSdk';

const numberParameter = (
  id: string,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
  unit?: string,
): PluginParameterDefinition => ({ id, name, type: 'number', defaultValue, min, max, step, unit });

const envelopeParameters = (
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): PluginParameterDefinition[] => [
  numberParameter('attack', 'Attack', attack, 0.001, 5, 0.001, 's'),
  numberParameter('decay', 'Decay', decay, 0.001, 5, 0.001, 's'),
  numberParameter('sustain', 'Sustain', sustain, 0, 1, 0.01),
  numberParameter('release', 'Release', release, 0.001, 10, 0.001, 's'),
];

const numeric = (parameters: Record<string, PluginParameterValue>, key: string, fallback: number): number =>
  typeof parameters[key] === 'number' ? parameters[key] as number : fallback;
const text = (parameters: Record<string, PluginParameterValue>, key: string, fallback: string): string =>
  typeof parameters[key] === 'string' ? parameters[key] as string : fallback;

function createInstrumentInstance(
  node: Tone.ToneAudioNode & {
    triggerAttackRelease: (...args: any[]) => unknown;
    releaseAll?: (...args: any[]) => unknown;
  },
  apply: (parameters: Record<string, PluginParameterValue>) => void,
): InstrumentPluginInstance {
  let disposed = false;
  return {
    node,
    triggerAttackRelease: (note, duration, time, velocity) => {
      if (!disposed) node.triggerAttackRelease(note, duration, time, velocity);
    },
    releaseAll: time => {
      if (!disposed) node.releaseAll?.(time);
    },
    setParameters: parameters => {
      if (!disposed) apply(parameters);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      node.disconnect?.();
      node.dispose();
    },
  };
}

function createPolyInstrument(
  voice: any,
  parameters: Record<string, PluginParameterValue>,
  defaults: { oscillator?: string; attack: number; decay: number; sustain: number; release: number },
): InstrumentPluginInstance {
  const options = () => ({
    ...(defaults.oscillator == null ? {} : { oscillator: { type: text(parameters, 'wave', defaults.oscillator) } }),
    envelope: {
      attack: numeric(parameters, 'attack', defaults.attack),
      decay: numeric(parameters, 'decay', defaults.decay),
      sustain: numeric(parameters, 'sustain', defaults.sustain),
      release: numeric(parameters, 'release', defaults.release),
    },
  });
  const synth = new Tone.PolySynth(voice, options() as any) as Tone.ToneAudioNode & {
    triggerAttackRelease: (...args: any[]) => unknown;
    set: (options: unknown) => unknown;
  };
  return createInstrumentInstance(synth, next => {
    parameters = next;
    synth.set(options());
  });
}

function createEffectInstance<T extends Tone.ToneAudioNode>(
  node: T,
  apply: (node: T, parameters: Record<string, PluginParameterValue>) => void,
  initial: Record<string, PluginParameterValue>,
): EffectPluginInstance {
  let disposed = false;
  apply(node, initial);
  return {
    node,
    setParameters: parameters => {
      if (!disposed) apply(node, parameters);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      node.disconnect?.();
      node.dispose();
    },
  };
}

function createParametricEqInstance(parameters: Record<string, PluginParameterValue>): EffectPluginInstance {
  const input = new Tone.Gain();
  const output = new Tone.Gain();
  const filters = Array.from({ length: 8 }, () => new Tone.Filter({ type: 'peaking', frequency: 1000, gain: 0, Q: 1 }));
  let fft: Tone.FFT | null = null;
  let pendingFft: Tone.FFT | null = null;
  try {
    pendingFft = new Tone.FFT({ size: 256, smoothing: 0.8, normalRange: false });
    output.connect(pendingFft);
    fft = pendingFft;
  } catch {
    pendingFft?.dispose();
    fft = null;
  }
  input.chain(...filters, output);
  let disposed = false;
  const apply = (next: Record<string, PluginParameterValue>) => {
    for (const band of readEqBands(next)) {
      const filter = filters[band.index];
      filter.frequency.value = band.frequency;
      filter.gain.value = band.enabled ? band.gain : 0;
      filter.Q.value = band.q;
    }
  };
  apply(parameters);
  return {
    node: input,
    inputNode: input,
    outputNode: output,
    prepareReconnect: () => {
      if (disposed) return;
      output.disconnect();
      if (fft) output.connect(fft);
    },
    setParameters: next => {
      if (!disposed) apply(next);
    },
    getFrequencyData: () => {
      if (disposed || !fft) return undefined;
      try {
        return new Float32Array(fft.getValue());
      } catch {
        return undefined;
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      filters.forEach(filter => filter.dispose());
      input.dispose();
      output.dispose();
      fft?.dispose();
    },
  };
}

export const builtInInstrumentPlugins: readonly InstrumentPluginDefinition[] = [
  {
    id: 'duckdaw.instrument.synth',
    version: '1.0.0',
    kind: 'instrument',
    name: 'Poly Synth',
    description: 'Flexible polyphonic oscillator synthesizer.',
    parameters: [
      { id: 'wave', name: 'Wave', type: 'enum', defaultValue: 'square', values: ['sine', 'triangle', 'square', 'sawtooth'] },
      ...envelopeParameters(0.01, 0.2, 0.5, 0.5),
    ],
    create: parameters => createPolyInstrument(Tone.Synth, parameters, {
      oscillator: 'square', attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5,
    }),
  },
  {
    id: 'duckdaw.instrument.keys',
    version: '1.0.0',
    kind: 'instrument',
    name: 'Soft Keys',
    description: 'Soft triangle-wave keyboard instrument.',
    parameters: envelopeParameters(0.02, 1, 0.4, 1),
    create: parameters => createPolyInstrument(Tone.Synth, { ...parameters, wave: 'triangle' }, {
      oscillator: 'triangle', attack: 0.02, decay: 1, sustain: 0.4, release: 1,
    }),
  },
  {
    id: 'duckdaw.instrument.bass',
    version: '1.0.0',
    kind: 'instrument',
    name: 'Analog Bass',
    description: 'Short sawtooth bass synthesizer.',
    parameters: envelopeParameters(0.05, 0.3, 0.2, 1),
    create: parameters => createPolyInstrument(Tone.Synth, { ...parameters, wave: 'sawtooth' }, {
      oscillator: 'sawtooth', attack: 0.05, decay: 0.3, sustain: 0.2, release: 1,
    }),
  },
  {
    id: 'duckdaw.instrument.drums',
    version: '1.0.0',
    kind: 'instrument',
    name: 'Membrane Drums',
    description: 'Polyphonic membrane percussion voice.',
    parameters: [
      numberParameter('pitchDecay', 'Pitch Decay', 0.05, 0.001, 1, 0.001, 's'),
      numberParameter('octaves', 'Octaves', 10, 1, 12, 1),
    ],
    create: parameters => {
      const options = () => ({
        pitchDecay: numeric(parameters, 'pitchDecay', 0.05),
        octaves: numeric(parameters, 'octaves', 10),
      });
      const synth = new Tone.PolySynth(Tone.MembraneSynth, options() as any) as Tone.ToneAudioNode & {
        triggerAttackRelease: (...args: any[]) => unknown;
        set: (options: unknown) => unknown;
      };
      return createInstrumentInstance(synth, next => {
        parameters = next;
        synth.set(options());
      });
    },
  },
  {
    id: 'duckdaw.instrument.pluck',
    version: '1.0.0',
    kind: 'instrument',
    name: 'Pluck',
    description: 'Karplus-Strong style plucked-string instrument.',
    parameters: [
      numberParameter('attackNoise', 'Attack Noise', 1, 0.1, 20, 0.1),
      numberParameter('dampening', 'Dampening', 4000, 200, 12000, 10, 'Hz'),
      numberParameter('resonance', 'Resonance', 0.7, 0, 1, 0.01),
    ],
    create: parameters => {
      const options = () => ({
        attackNoise: numeric(parameters, 'attackNoise', 1),
        dampening: numeric(parameters, 'dampening', 4000),
        resonance: numeric(parameters, 'resonance', 0.7),
      });
      const synth = new Tone.PluckSynth(options()) as Tone.ToneAudioNode & {
        triggerAttackRelease: (...args: any[]) => unknown;
        set: (options: unknown) => unknown;
      };
      return createInstrumentInstance(synth, next => {
        parameters = next;
        synth.set(options());
      });
    },
  },
];

export const builtInEffectPlugins: readonly EffectPluginDefinition[] = [
  {
    id: 'duckdaw.effect.reverb', version: '1.0.0', kind: 'effect', name: 'Reverb',
    description: 'Algorithmic room reverb.',
    parameters: [
      numberParameter('decay', 'Decay', 2, 0.1, 20, 0.1, 's'),
      numberParameter('wet', 'Wet', 1, 0, 1, 0.01),
    ],
    create: parameters => createEffectInstance(new Tone.Reverb(numeric(parameters, 'decay', 2)), (node, next) => {
      (node as any).decay = numeric(next, 'decay', 2);
      node.wet.value = numeric(next, 'wet', 1);
    }, parameters),
  },
  {
    id: 'duckdaw.effect.delay', version: '1.0.0', kind: 'effect', name: 'Feedback Delay',
    description: 'Tempo-independent feedback delay.',
    parameters: [
      numberParameter('delayTime', 'Delay Time', 0.25, 0.01, 2, 0.01, 's'),
      numberParameter('feedback', 'Feedback', 0.3, 0, 0.95, 0.01),
      numberParameter('wet', 'Wet', 1, 0, 1, 0.01),
    ],
    create: parameters => createEffectInstance(
      new Tone.FeedbackDelay(numeric(parameters, 'delayTime', 0.25), numeric(parameters, 'feedback', 0.3)),
      (node, next) => {
        node.delayTime.value = numeric(next, 'delayTime', 0.25);
        node.feedback.value = numeric(next, 'feedback', 0.3);
        node.wet.value = numeric(next, 'wet', 1);
      },
      parameters,
    ),
  },
  {
    id: 'duckdaw.effect.limiter', version: '1.0.0', kind: 'effect', name: 'Limiter',
    description: 'Peak limiter for buses and tracks.',
    parameters: [numberParameter('threshold', 'Threshold', -1, -30, 0, 0.1, 'dB')],
    create: parameters => createEffectInstance(new Tone.Limiter(numeric(parameters, 'threshold', -1)), (node, next) => {
      node.threshold.value = numeric(next, 'threshold', -1);
    }, parameters),
  },
  {
    id: 'duckdaw.effect.distortion', version: '1.0.0', kind: 'effect', name: 'Distortion',
    description: 'Waveshaping distortion with wet/dry control.',
    parameters: [
      numberParameter('distortion', 'Drive', 0.4, 0, 1, 0.01),
      numberParameter('wet', 'Wet', 1, 0, 1, 0.01),
    ],
    create: parameters => createEffectInstance(new Tone.Distortion(numeric(parameters, 'distortion', 0.4)), (node, next) => {
      node.distortion = numeric(next, 'distortion', 0.4);
      node.wet.value = numeric(next, 'wet', 1);
    }, parameters),
  },
  {
    id: 'duckdaw.effect.chorus', version: '1.0.0', kind: 'effect', name: 'Chorus',
    description: 'Stereo modulation chorus.',
    parameters: [
      numberParameter('frequency', 'Rate', 1.5, 0.1, 10, 0.1, 'Hz'),
      numberParameter('delayTime', 'Delay Time', 3.5, 1, 20, 0.1, 'ms'),
      numberParameter('depth', 'Depth', 0.7, 0, 1, 0.01),
      numberParameter('wet', 'Wet', 1, 0, 1, 0.01),
    ],
    create: parameters => {
      const chorus = new Tone.Chorus(
        numeric(parameters, 'frequency', 1.5),
        numeric(parameters, 'delayTime', 3.5),
        numeric(parameters, 'depth', 0.7),
      ).start();
      return createEffectInstance(chorus, (node, next) => {
        node.frequency.value = numeric(next, 'frequency', 1.5);
        node.delayTime = numeric(next, 'delayTime', 3.5);
        node.depth = numeric(next, 'depth', 0.7);
        node.wet.value = numeric(next, 'wet', 1);
      }, parameters);
    },
  },
  {
    id: 'duckdaw.effect.parametric-eq', version: '1.0.0', kind: 'effect', name: 'Parametric EQ',
    description: 'Eight-band visual parametric equalizer with realtime FFT analysis.',
    parameters: createEqParameterDefinitions(),
    create: parameters => createParametricEqInstance(parameters),
  },
];

export const builtInPlugins = [...builtInInstrumentPlugins, ...builtInEffectPlugins] as const;

export function installBuiltInPlugins(registry: PluginRegistry = duckDawPluginRegistry): PluginRegistry {
  for (const definition of builtInPlugins) {
    if (!registry.has(definition.id)) registry.registerBuiltIn(definition);
  }
  return registry;
}

export function createBuiltInPluginRegistry(): PluginRegistry {
  return installBuiltInPlugins(new PluginRegistry());
}

installBuiltInPlugins();
