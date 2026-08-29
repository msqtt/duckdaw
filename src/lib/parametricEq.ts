import type { PluginParameterDefinition, PluginParameterValue } from './pluginSdk';

export const EQ_BAND_COUNT = 8;
export const EQ_MIN_FREQUENCY = 20;
export const EQ_MAX_FREQUENCY = 20_000;
export const EQ_MIN_GAIN = -24;
export const EQ_MAX_GAIN = 24;
export const EQ_MIN_Q = 0.1;
export const EQ_MAX_Q = 18;

export interface ParametricEqBand {
  index: number;
  enabled: boolean;
  frequency: number;
  gain: number;
  q: number;
}

const DEFAULT_FREQUENCIES = [80, 1000, 8000, 160, 320, 2500, 5000, 12000] as const;

const finiteOr = (value: PluginParameterValue | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const key = (index: number, suffix: 'Enabled' | 'Frequency' | 'Gain' | 'Q') => `band${index + 1}${suffix}`;

export function createDefaultEqParameters(): Record<string, PluginParameterValue> {
  const parameters: Record<string, PluginParameterValue> = {};
  for (let index = 0; index < EQ_BAND_COUNT; index += 1) {
    parameters[key(index, 'Enabled')] = index < 3 ? 1 : 0;
    parameters[key(index, 'Frequency')] = DEFAULT_FREQUENCIES[index];
    parameters[key(index, 'Gain')] = 0;
    parameters[key(index, 'Q')] = 1;
  }
  return parameters;
}

export function createEqParameterDefinitions(): PluginParameterDefinition[] {
  const defaults = createDefaultEqParameters();
  return Array.from({ length: EQ_BAND_COUNT }, (_, index) => [
    { id: key(index, 'Enabled'), name: `Band ${index + 1} Enabled`, type: 'number' as const, defaultValue: defaults[key(index, 'Enabled')] as number, min: 0, max: 1, step: 1 },
    { id: key(index, 'Frequency'), name: `Band ${index + 1} Frequency`, type: 'number' as const, defaultValue: defaults[key(index, 'Frequency')] as number, min: EQ_MIN_FREQUENCY, max: EQ_MAX_FREQUENCY, step: 1, unit: 'Hz' },
    { id: key(index, 'Gain'), name: `Band ${index + 1} Gain`, type: 'number' as const, defaultValue: 0, min: EQ_MIN_GAIN, max: EQ_MAX_GAIN, step: 0.1, unit: 'dB' },
    { id: key(index, 'Q'), name: `Band ${index + 1} Q`, type: 'number' as const, defaultValue: 1, min: EQ_MIN_Q, max: EQ_MAX_Q, step: 0.1 },
  ]).flat();
}

export function readEqBands(parameters: Record<string, PluginParameterValue>): ParametricEqBand[] {
  const defaults = createDefaultEqParameters();
  return Array.from({ length: EQ_BAND_COUNT }, (_, index) => ({
    index,
    enabled: finiteOr(parameters[key(index, 'Enabled')], defaults[key(index, 'Enabled')] as number) >= 0.5,
    frequency: clamp(finiteOr(parameters[key(index, 'Frequency')], defaults[key(index, 'Frequency')] as number), EQ_MIN_FREQUENCY, EQ_MAX_FREQUENCY),
    gain: clamp(finiteOr(parameters[key(index, 'Gain')], 0), EQ_MIN_GAIN, EQ_MAX_GAIN),
    q: clamp(finiteOr(parameters[key(index, 'Q')], 1), EQ_MIN_Q, EQ_MAX_Q),
  }));
}

export function updateEqBandParameters(
  parameters: Record<string, PluginParameterValue>,
  index: number,
  updates: Partial<Omit<ParametricEqBand, 'index'>>,
): Record<string, PluginParameterValue> {
  if (!Number.isInteger(index) || index < 0 || index >= EQ_BAND_COUNT) throw new Error('Invalid EQ band index');
  const current = readEqBands(parameters)[index];
  const next = { ...current, ...updates };
  return {
    ...parameters,
    [key(index, 'Enabled')]: next.enabled ? 1 : 0,
    [key(index, 'Frequency')]: clamp(finiteOr(next.frequency, current.frequency), EQ_MIN_FREQUENCY, EQ_MAX_FREQUENCY),
    [key(index, 'Gain')]: clamp(finiteOr(next.gain, current.gain), EQ_MIN_GAIN, EQ_MAX_GAIN),
    [key(index, 'Q')]: clamp(finiteOr(next.q, current.q), EQ_MIN_Q, EQ_MAX_Q),
  };
}

export function eqFrequencyToX(frequency: number): number {
  const clamped = clamp(frequency, EQ_MIN_FREQUENCY, EQ_MAX_FREQUENCY);
  return Math.log(clamped / EQ_MIN_FREQUENCY) / Math.log(EQ_MAX_FREQUENCY / EQ_MIN_FREQUENCY);
}

export function eqXToFrequency(x: number): number {
  const normalized = clamp(x, 0, 1);
  return EQ_MIN_FREQUENCY * Math.pow(EQ_MAX_FREQUENCY / EQ_MIN_FREQUENCY, normalized);
}

export function eqGainToY(gain: number): number {
  return (EQ_MAX_GAIN - clamp(gain, EQ_MIN_GAIN, EQ_MAX_GAIN)) / (EQ_MAX_GAIN - EQ_MIN_GAIN);
}

export function eqYToGain(y: number): number {
  return EQ_MAX_GAIN - clamp(y, 0, 1) * (EQ_MAX_GAIN - EQ_MIN_GAIN);
}
