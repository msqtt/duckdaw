/**
 * REC-PRO-02: Count-In / Pre-Roll computation
 * Pure function; Transport execution is handled at the UI/app layer.
 */
import { beatsPerBar, type TimeSignature } from './time';

export type CountInBars = 0 | 1 | 2 | 4;

export interface CountInConfig {
  bars: CountInBars;
  timeSignature: TimeSignature;
  bpm: number;
  metronomeEnabled: boolean;
}

export interface CountInResult {
  /** The beat where recording actually starts */
  recordStartBeat: number;
  /** Number of beats in the count-in phase */
  countInBeats: number;
}

/**
 * Compute the count-in parameters. If bars=0, returns no count-in.
 */
export function computeCountIn(
  config: CountInConfig,
  playheadBeat: number,
): CountInResult {
  if (config.bars === 0) {
    return { recordStartBeat: playheadBeat, countInBeats: 0 };
  }
  const perBar = beatsPerBar(config.timeSignature);
  const countInBeats = config.bars * perBar;
  return {
    recordStartBeat: playheadBeat,
    countInBeats,
  };
}
