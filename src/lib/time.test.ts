import { describe, expect, it } from 'vitest';
import {
  beatsPerBar,
  beatsToTransportPosition,
  transportPositionToBeats,
} from './time';

describe('musical time conversion', () => {
  it.each([
    [[4, 4], 4],
    [[3, 4], 3],
    [[6, 8], 3],
    [[7, 8], 3.5],
  ] as const)('computes quarter-note beats per bar for %j', (signature, expected) => {
    expect(beatsPerBar([...signature])).toBe(expected);
  });

  it.each([
    [3, [3, 4], '1:0:0'],
    [6, [3, 4], '2:0:0'],
    [3, [6, 8], '1:0:0'],
    [3.5, [7, 8], '1:0:0'],
    [4.25, [7, 8], '1:0:3'],
  ] as const)('converts %s beats in %j to %s', (beats, signature, expected) => {
    expect(beatsToTransportPosition(beats, [...signature])).toBe(expected);
    expect(transportPositionToBeats(expected, [...signature])).toBeCloseTo(beats);
  });
});
