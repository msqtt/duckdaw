export type TempoCurve = 'step' | 'linear';

export interface TempoPoint {
  id: string;
  beat: number;
  bpm: number;
  curve: TempoCurve;
}

export const TEMPO_BPM_MIN = 20;
export const TEMPO_BPM_MAX = 300;
const EPSILON = 1e-12;

export function sortTempoPoints(points: readonly TempoPoint[]): TempoPoint[] {
  return points.map(point => ({ ...point })).sort((a, b) => a.beat - b.beat);
}

/** Validate and return an immutable, beat-sorted tempo map. */
export function validateTempoMap(points: readonly TempoPoint[]): TempoPoint[] {
  if (!Array.isArray(points) || points.length === 0) throw new Error('Tempo map must contain a beat-zero point');

  const normalized = sortTempoPoints(points);
  const ids = new Set<string>();
  const beats = new Set<number>();
  for (const point of normalized) {
    if (typeof point.id !== 'string' || point.id.length === 0 || ids.has(point.id)) {
      throw new Error('Tempo point IDs must be non-empty and unique');
    }
    if (!Number.isFinite(point.beat) || point.beat < 0 || beats.has(point.beat)) {
      throw new Error('Tempo point beats must be finite, non-negative, and unique');
    }
    if (!Number.isFinite(point.bpm) || point.bpm < TEMPO_BPM_MIN || point.bpm > TEMPO_BPM_MAX) {
      throw new Error(`Tempo BPM must be within ${TEMPO_BPM_MIN}..${TEMPO_BPM_MAX}`);
    }
    if (point.curve !== 'step' && point.curve !== 'linear') throw new Error('Invalid tempo curve');
    ids.add(point.id);
    beats.add(point.beat);
  }
  if (normalized[0].beat !== 0) throw new Error('The first tempo point must be at beat 0');
  return normalized;
}

function segmentSeconds(start: TempoPoint, end: TempoPoint | undefined, beatLength: number): number {
  if (beatLength <= 0) return 0;
  if (!end || start.curve === 'step' || Math.abs(end.bpm - start.bpm) < EPSILON) {
    return beatLength * 60 / start.bpm;
  }
  const fullLength = end.beat - start.beat;
  const slope = (end.bpm - start.bpm) / fullLength;
  const bpmAtEnd = start.bpm + slope * beatLength;
  return 60 / slope * Math.log(bpmAtEnd / start.bpm);
}

export function tempoAtBeat(beat: number, points: readonly TempoPoint[]): number {
  const map = validateTempoMap(points);
  const safeBeat = Math.max(0, Number.isFinite(beat) ? beat : 0);
  for (let index = 0; index < map.length - 1; index += 1) {
    const current = map[index];
    const next = map[index + 1];
    if (safeBeat >= next.beat) continue;
    if (current.curve === 'step') return current.bpm;
    const fraction = (safeBeat - current.beat) / (next.beat - current.beat);
    return current.bpm + (next.bpm - current.bpm) * fraction;
  }
  return map[map.length - 1].bpm;
}

export function beatsToSecondsWithTempoMap(beat: number, points: readonly TempoPoint[]): number {
  const map = validateTempoMap(points);
  if (!Number.isFinite(beat) || beat < 0) throw new Error('Beat must be finite and non-negative');
  if (beat === 0) return 0;

  let seconds = 0;
  for (let index = 0; index < map.length; index += 1) {
    const current = map[index];
    const next = map[index + 1];
    if (beat <= current.beat) break;
    const length = Math.min(beat, next?.beat ?? beat) - current.beat;
    seconds += segmentSeconds(current, next, length);
    if (!next || beat <= next.beat) break;
  }
  return seconds;
}

export function secondsToBeatsWithTempoMap(seconds: number, points: readonly TempoPoint[]): number {
  const map = validateTempoMap(points);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Seconds must be finite and non-negative');
  if (seconds === 0) return 0;

  let remaining = seconds;
  for (let index = 0; index < map.length; index += 1) {
    const current = map[index];
    const next = map[index + 1];
    if (!next) return current.beat + remaining * current.bpm / 60;

    const length = next.beat - current.beat;
    const duration = segmentSeconds(current, next, length);
    if (remaining > duration + EPSILON) {
      remaining -= duration;
      continue;
    }
    if (current.curve === 'step' || Math.abs(next.bpm - current.bpm) < EPSILON) {
      return current.beat + remaining * current.bpm / 60;
    }
    const slope = (next.bpm - current.bpm) / length;
    return current.beat + current.bpm * (Math.exp(remaining * slope / 60) - 1) / slope;
  }
  return 0;
}

export function createDefaultTempoMap(bpm: number): TempoPoint[] {
  if (!Number.isFinite(bpm)) throw new Error('Invalid BPM');
  return [{
    id: 'tempo-0',
    beat: 0,
    bpm: Math.max(TEMPO_BPM_MIN, Math.min(TEMPO_BPM_MAX, bpm)),
    curve: 'step',
  }];
}
