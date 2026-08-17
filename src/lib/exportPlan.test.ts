import { describe, expect, it } from 'vitest';
import { createExportPlan } from './exportPlan';

describe('audio export plan', () => {
  const clips = [
    { start: 0, duration: 4 },
    { start: 12, duration: 4 },
  ];

  it('uses the selected sample rate and full project bounds', () => {
    expect(createExportPlan({ clips, bpm: 120, region: 'full', loopStart: 4, loopEnd: 8, sampleRate: 48000 }))
      .toEqual({ startBeat: 0, endBeat: 16, durationSeconds: 8, sampleRate: 48000 });
  });

  it('uses the loop selection and validates its bounds', () => {
    expect(createExportPlan({ clips, bpm: 120, region: 'selection', loopStart: 4, loopEnd: 10, sampleRate: 96000 }))
      .toEqual({ startBeat: 4, endBeat: 10, durationSeconds: 3, sampleRate: 96000 });
    expect(() => createExportPlan({ clips, bpm: 120, region: 'selection', loopStart: 8, loopEnd: 8, sampleRate: 44100 }))
      .toThrow(/loop|region/i);
  });

  it('rejects an empty project for full export', () => {
    expect(() => createExportPlan({ clips: [], bpm: 120, region: 'full', loopStart: 0, loopEnd: 4, sampleRate: 44100 }))
      .toThrow(/empty/i);
  });
});
