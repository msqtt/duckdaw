import { beatsToSecondsWithTempoMap, createDefaultTempoMap, type TempoPoint } from './tempoMap';

export interface ExportLimiterOptions {
  enabled: boolean;
  ceilingDb: number;
}

export interface ExportPlanInput {
  clips: Array<{ start: number; duration: number }>;
  bpm: number;
  tempoTrack?: readonly TempoPoint[];
  region: 'full' | 'selection';
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
  includeTail?: boolean;
  tailSeconds?: number;
  normalize?: boolean;
  limiter?: Partial<ExportLimiterOptions>;
  stems?: boolean;
}

export interface ExportPlan {
  startBeat: number;
  endBeat: number;
  contentDurationSeconds: number;
  tailSeconds: number;
  durationSeconds: number;
  sampleRate: number;
  normalize: boolean;
  limiter: ExportLimiterOptions;
  stems: boolean;
  /** Convert an absolute project beat into seconds relative to the export start. */
  secondsAtBeat: (beat: number) => number;
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

  const tempoTrack = input.tempoTrack ?? createDefaultTempoMap(input.bpm);
  const startSeconds = beatsToSecondsWithTempoMap(startBeat, tempoTrack);
  const secondsAtBeat = (beat: number) => beatsToSecondsWithTempoMap(beat, tempoTrack) - startSeconds;
  const contentDurationSeconds = secondsAtBeat(endBeat);
  const includeTail = input.includeTail ?? true;
  const tailSeconds = includeTail ? (input.tailSeconds ?? 2) : 0;
  if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) {
    throw new Error('Export tail must be within 0..30 seconds');
  }

  const ceilingDb = input.limiter?.ceilingDb ?? -1;
  if (!Number.isFinite(ceilingDb) || ceilingDb < -24 || ceilingDb > 0) {
    throw new Error('Limiter ceiling must be within -24..0 dBFS');
  }

  return {
    startBeat,
    endBeat,
    contentDurationSeconds,
    tailSeconds,
    durationSeconds: contentDurationSeconds + tailSeconds,
    sampleRate: input.sampleRate,
    normalize: input.normalize ?? false,
    limiter: { enabled: input.limiter?.enabled ?? true, ceilingDb },
    stems: input.stems ?? false,
    secondsAtBeat,
  };
}
