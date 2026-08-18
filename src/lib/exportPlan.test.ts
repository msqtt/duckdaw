import { describe, expect, it } from 'vitest';
import { createExportPlan } from './exportPlan';

const tempoTrack = [
  { id: 'tempo-0', beat: 0, bpm: 120, curve: 'step' as const },
  { id: 'tempo-1', beat: 4, bpm: 60, curve: 'step' as const },
];

describe('audio export plan', () => {
  const clips = [
    { start: 0, duration: 4 },
    { start: 12, duration: 4 },
  ];

  it('uses the selected sample rate and full project bounds', () => {
    expect(createExportPlan({ clips, bpm: 120, region: 'full', loopStart: 4, loopEnd: 8, sampleRate: 48000, includeTail: false }))
      .toMatchObject({ startBeat: 0, endBeat: 16, contentDurationSeconds: 8, durationSeconds: 8, sampleRate: 48000 });
  });

  it('uses the loop selection and validates its bounds', () => {
    expect(createExportPlan({ clips, bpm: 120, region: 'selection', loopStart: 4, loopEnd: 10, sampleRate: 96000, includeTail: false }))
      .toMatchObject({ startBeat: 4, endBeat: 10, contentDurationSeconds: 3, durationSeconds: 3, sampleRate: 96000 });
    expect(() => createExportPlan({ clips, bpm: 120, region: 'selection', loopStart: 8, loopEnd: 8, sampleRate: 44100 }))
      .toThrow(/loop|region/i);
  });

  it('integrates absolute tempo-map time for non-zero selections and appends an explicit effect tail', () => {
    const plan = createExportPlan({
      clips,
      bpm: 120,
      tempoTrack,
      region: 'selection',
      loopStart: 2,
      loopEnd: 6,
      sampleRate: 48000,
      includeTail: true,
      tailSeconds: 2.5,
    });
    expect(plan).toMatchObject({
      startBeat: 2,
      endBeat: 6,
      contentDurationSeconds: 3,
      tailSeconds: 2.5,
      durationSeconds: 5.5,
    });
    expect(plan.secondsAtBeat(4)).toBe(1);
    expect(plan.secondsAtBeat(6)).toBe(3);
  });

  it('freezes normalize, limiter and stem options with safe defaults and bounds', () => {
    const plan = createExportPlan({ clips, bpm: 120, region: 'full', loopStart: 0, loopEnd: 4, sampleRate: 44100 });
    expect(plan).toMatchObject({
      normalize: false,
      limiter: { enabled: true, ceilingDb: -1 },
      stems: false,
      tailSeconds: 2,
    });
    expect(() => createExportPlan({ clips, bpm: 120, region: 'full', loopStart: 0, loopEnd: 4, sampleRate: 44100, includeTail: true, tailSeconds: 31 })).toThrow(/tail/i);
    expect(() => createExportPlan({ clips, bpm: 120, region: 'full', loopStart: 0, loopEnd: 4, sampleRate: 44100, limiter: { enabled: true, ceilingDb: 1 } })).toThrow(/ceiling/i);
  });

  it('rejects an empty project for full export', () => {
    expect(() => createExportPlan({ clips: [], bpm: 120, region: 'full', loopStart: 0, loopEnd: 4, sampleRate: 44100 }))
      .toThrow(/empty/i);
  });
});
