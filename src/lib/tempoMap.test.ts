import { describe, expect, it } from 'vitest';
import {
  beatsToSecondsWithTempoMap,
  secondsToBeatsWithTempoMap,
  tempoAtBeat,
  validateTempoMap,
  type TempoPoint,
} from './tempoMap';

const point = (id: string, beat: number, bpm: number, curve: 'step' | 'linear' = 'step'): TempoPoint => ({
  id,
  beat,
  bpm,
  curve,
});

describe('tempo map', () => {
  it('degrades a single point map to constant-tempo conversion', () => {
    const map = [point('start', 0, 120)];
    expect(beatsToSecondsWithTempoMap(8, map)).toBeCloseTo(4, 10);
    expect(secondsToBeatsWithTempoMap(4, map)).toBeCloseTo(8, 10);
    expect(tempoAtBeat(32, map)).toBe(120);
  });

  it('integrates step segments at exact boundaries', () => {
    const map = [point('a', 0, 120, 'step'), point('b', 4, 60, 'step')];
    expect(beatsToSecondsWithTempoMap(4, map)).toBeCloseTo(2, 10);
    expect(beatsToSecondsWithTempoMap(8, map)).toBeCloseTo(6, 10);
    expect(secondsToBeatsWithTempoMap(2, map)).toBeCloseTo(4, 10);
    expect(secondsToBeatsWithTempoMap(6, map)).toBeCloseTo(8, 10);
  });

  it('analytically integrates a BPM-linear segment and inverts it', () => {
    const map = [point('a', 0, 60, 'linear'), point('b', 4, 120, 'step')];
    const expectedAtFour = 4 * Math.log(2);
    expect(beatsToSecondsWithTempoMap(4, map)).toBeCloseTo(expectedAtFour, 10);
    expect(tempoAtBeat(2, map)).toBeCloseTo(90, 10);

    for (const beat of [0, 0.25, 1, 2, 3.75, 4, 9]) {
      const seconds = beatsToSecondsWithTempoMap(beat, map);
      expect(secondsToBeatsWithTempoMap(seconds, map)).toBeCloseTo(beat, 8);
    }
  });

  it('returns a normalized clone sorted by beat without mutating input', () => {
    const input = [point('later', 8, 90), point('start', 0, 120)];
    expect(validateTempoMap(input).map(item => item.id)).toEqual(['start', 'later']);
    expect(input.map(item => item.id)).toEqual(['later', 'start']);
  });

  it.each([
    { name: 'missing beat zero', map: [point('a', 1, 120)] },
    { name: 'duplicate id', map: [point('a', 0, 120), point('a', 1, 100)] },
    { name: 'duplicate beat', map: [point('a', 0, 120), point('b', 0, 100)] },
    { name: 'low bpm', map: [point('a', 0, 19)] },
    { name: 'high bpm', map: [point('a', 0, 301)] },
    { name: 'negative beat', map: [point('a', -1, 120)] },
  ])('rejects $name', ({ map }) => {
    expect(() => validateTempoMap(map)).toThrow();
  });
});
