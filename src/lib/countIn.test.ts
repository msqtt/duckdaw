import { describe, it, expect } from 'vitest';
import { computeCountIn, type CountInBars, type CountInConfig } from './countIn';

function makeConfig(bars: CountInBars, ts: [number, number] = [4, 4]): CountInConfig {
  return { bars, timeSignature: ts, bpm: 120, metronomeEnabled: true };
}

describe('REC-PRO-02: Count-In / Pre-Roll', () => {
  it('bars=0 returns no count-in', () => {
    const result = computeCountIn(makeConfig(0), 8);
    expect(result.recordStartBeat).toBe(8);
    expect(result.countInBeats).toBe(0);
  });

  it('4/4, 1 bar = 4 beats count-in', () => {
    const result = computeCountIn(makeConfig(1, [4, 4]), 8);
    expect(result.countInBeats).toBe(4);
    expect(result.recordStartBeat).toBe(8);
  });

  it('4/4, 2 bars = 8 beats count-in', () => {
    const result = computeCountIn(makeConfig(2, [4, 4]), 4);
    expect(result.countInBeats).toBe(8);
    expect(result.recordStartBeat).toBe(4);
  });

  it('4/4, 4 bars = 16 beats count-in', () => {
    const result = computeCountIn(makeConfig(4, [4, 4]), 0);
    expect(result.countInBeats).toBe(16);
    expect(result.recordStartBeat).toBe(0);
  });

  it('3/4, 1 bar = 3 beats count-in', () => {
    const result = computeCountIn(makeConfig(1, [3, 4]), 6);
    expect(result.countInBeats).toBe(3);
  });

  it('3/4, 2 bars = 6 beats count-in', () => {
    const result = computeCountIn(makeConfig(2, [3, 4]), 0);
    expect(result.countInBeats).toBe(6);
  });

  it('6/8, 1 bar = 3 beats count-in', () => {
    // 6/8 = 6 * (4/8) = 3 quarter-note beats per bar
    const result = computeCountIn(makeConfig(1, [6, 8]), 0);
    expect(result.countInBeats).toBe(3);
  });

  it('6/8, 4 bars = 12 beats count-in', () => {
    const result = computeCountIn(makeConfig(4, [6, 8]), 0);
    expect(result.countInBeats).toBe(12);
  });

  it('7/8, 2 bars = 7 beats count-in', () => {
    // 7/8 = 7 * (4/8) = 3.5 quarter-note beats per bar
    const result = computeCountIn(makeConfig(2, [7, 8]), 0);
    expect(result.countInBeats).toBe(7); // 3.5 * 2
  });
});
