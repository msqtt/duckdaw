import { beatsToSeconds } from './time';

export interface ExportPlanInput {
  clips: Array<{ start: number; duration: number }>;
  bpm: number;
  region: 'full' | 'selection';
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
}

export interface ExportPlan {
  startBeat: number;
  endBeat: number;
  durationSeconds: number;
  sampleRate: number;
}

export function createExportPlan(input: ExportPlanInput): ExportPlan {
  if (![44100, 48000, 96000].includes(input.sampleRate)) {
    throw new Error('Unsupported export sample rate');
  }

  let startBeat = 0;
  let endBeat: number;
  if (input.region === 'selection') {
    if (!(input.loopEnd > input.loopStart)) throw new Error('Invalid loop export region');
    startBeat = input.loopStart;
    endBeat = input.loopEnd;
  } else {
    if (input.clips.length === 0) throw new Error('Cannot export an empty project');
    endBeat = Math.max(...input.clips.map(clip => clip.start + clip.duration));
  }

  return {
    startBeat,
    endBeat,
    durationSeconds: beatsToSeconds(endBeat - startBeat, input.bpm),
    sampleRate: input.sampleRate,
  };
}
