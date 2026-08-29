import { describe, expect, it } from 'vitest';
import {
  EQ_BAND_COUNT,
  createDefaultEqParameters,
  eqFrequencyToX,
  eqGainToY,
  eqXToFrequency,
  eqYToGain,
  readEqBands,
} from './parametricEq';

describe('PLUG-EQ-01 parametric EQ domain', () => {
  it('provides eight stable persisted band slots with safe defaults', () => {
    const parameters = createDefaultEqParameters();
    const bands = readEqBands(parameters);
    expect(bands).toHaveLength(EQ_BAND_COUNT);
    expect(EQ_BAND_COUNT).toBe(8);
    expect(bands.filter(band => band.enabled)).toEqual([
      expect.objectContaining({ index: 0, frequency: 80, gain: 0, q: 1 }),
      expect.objectContaining({ index: 1, frequency: 1000, gain: 0, q: 1 }),
      expect.objectContaining({ index: 2, frequency: 8000, gain: 0, q: 1 }),
    ]);
    expect(Object.keys(parameters)).toHaveLength(32);
  });

  it('clamps malformed runtime values to the frozen frequency/gain/Q ranges', () => {
    const bands = readEqBands({
      ...createDefaultEqParameters(),
      band1Enabled: 1,
      band1Frequency: -10,
      band1Gain: 200,
      band1Q: 0,
      band2Frequency: Number.NaN,
    });
    expect(bands[0]).toMatchObject({ enabled: true, frequency: 20, gain: 24, q: 0.1 });
    expect(bands[1].frequency).toBe(1000);
  });

  it('round-trips logarithmic frequency and linear gain coordinates at boundaries', () => {
    for (const frequency of [20, 80, 1000, 8000, 20000]) {
      expect(eqXToFrequency(eqFrequencyToX(frequency))).toBeCloseTo(frequency, 6);
    }
    for (const gain of [-24, -12, 0, 12, 24]) {
      expect(eqYToGain(eqGainToY(gain))).toBeCloseTo(gain, 6);
    }
    expect(eqXToFrequency(-1)).toBe(20);
    expect(eqXToFrequency(2)).toBe(20000);
    expect(eqYToGain(-1)).toBe(24);
    expect(eqYToGain(2)).toBe(-24);
  });
});
