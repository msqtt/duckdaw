import type { AudioEditParams, Clip, FadeCurve, Note } from '../store/dawStore';
import {
  beatsToSecondsWithTempoMap,
  secondsToBeatsWithTempoMap,
  type TempoPoint,
} from './tempoMap';

export type ClipTiming = number | readonly TempoPoint[];

function secondsAtBeat(beat: number, timing: ClipTiming): number {
  if (typeof timing === 'number') {
    if (!Number.isFinite(timing) || timing <= 0) throw new Error('BPM must be positive');
    return beat * 60 / timing;
  }
  return beatsToSecondsWithTempoMap(beat, timing);
}

function secondsBetweenBeats(startBeat: number, endBeat: number, timing: ClipTiming): number {
  return secondsAtBeat(endBeat, timing) - secondsAtBeat(startBeat, timing);
}

function beatAtSeconds(seconds: number, timing: ClipTiming): number {
  if (typeof timing === 'number') return seconds * timing / 60;
  return secondsToBeatsWithTempoMap(seconds, timing);
}

const MIN_CLIP_BEATS = 1 / 64;

export interface ClipPlaybackPlan {
  startBeat: number;
  durationBeats: number;
  durationSeconds: number;
  sourceOffsetSeconds: number;
  gainDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  fadeInCurve: FadeCurve;
  fadeOutCurve: FadeCurve;
  reversed: boolean;
}

export function createDefaultAudioEdit(): AudioEditParams {
  return {
    sourceOffsetSeconds: 0,
    gainDb: 0,
    fadeInBeats: 0,
    fadeOutBeats: 0,
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
    reversed: false,
  };
}

export function createFadeValueCurve(
  curve: FadeCurve,
  direction: 'in' | 'out',
  sampleCount = 128,
): number[] {
  const count = Math.max(2, Math.floor(sampleCount));
  const values = Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    switch (curve) {
      case 'exponential': return position ** 3;
      case 'sCurve': return position * position * (3 - 2 * position);
      case 'logarithmic': return Math.log10(1 + 9 * position);
      case 'linear':
      default: return position;
    }
  });
  return direction === 'in' ? values : values.reverse();
}

export function getAudioEdit(clip: Clip): AudioEditParams {
  return { ...createDefaultAudioEdit(), ...(clip.type === 'audio' ? clip.audioEdit : undefined) };
}

function assertInteriorBeat(clip: Clip, beat: number): number {
  const localBeat = beat - clip.start;
  if (!Number.isFinite(beat) || localBeat < MIN_CLIP_BEATS || localBeat > clip.duration - MIN_CLIP_BEATS) {
    throw new Error('Edit point must be inside the clip');
  }
  return localBeat;
}

function segmentNotes(notes: Note[], fromBeat: number, toBeat: number, generateId: () => string): Note[] {
  return notes.flatMap(note => {
    const overlapStart = Math.max(note.start, fromBeat);
    const overlapEnd = Math.min(note.start + note.duration, toBeat);
    if (overlapEnd <= overlapStart) return [];
    return [{
      ...note,
      id: fromBeat > note.start ? generateId() : note.id,
      start: overlapStart - fromBeat,
      duration: overlapEnd - overlapStart,
    }];
  });
}

function constrainFades(edit: AudioEditParams, duration: number, preferred: 'in' | 'out' = 'in'): AudioEditParams {
  const fadeInBeats = Math.max(0, Math.min(duration, edit.fadeInBeats));
  const fadeOutBeats = Math.max(0, Math.min(duration, edit.fadeOutBeats));
  if (fadeInBeats + fadeOutBeats <= duration) return { ...edit, fadeInBeats, fadeOutBeats };
  return preferred === 'in'
    ? { ...edit, fadeInBeats, fadeOutBeats: Math.max(0, duration - fadeInBeats) }
    : { ...edit, fadeInBeats: Math.max(0, duration - fadeOutBeats), fadeOutBeats };
}

export function splitClip(
  clip: Clip,
  beat: number,
  timing: ClipTiming,
  generateId: () => string = () => crypto.randomUUID(),
): [Clip, Clip] {
  const leftDuration = assertInteriorBeat(clip, beat);
  const rightDuration = clip.duration - leftDuration;
  const rightId = generateId();

  if (clip.type === 'midi') {
    return [
      { ...clip, duration: leftDuration, notes: segmentNotes(clip.notes, 0, leftDuration, generateId) },
      {
        ...clip,
        id: rightId,
        start: beat,
        duration: rightDuration,
        notes: segmentNotes(clip.notes, leftDuration, clip.duration, generateId),
      },
    ];
  }

  const edit = getAudioEdit(clip);
  const leftEdit = constrainFades({ ...edit, fadeOutBeats: 0 }, leftDuration, 'in');
  const rightEdit = constrainFades({
    ...edit,
    sourceOffsetSeconds: edit.sourceOffsetSeconds + secondsBetweenBeats(clip.start, beat, timing),
    fadeInBeats: 0,
  }, rightDuration, 'out');
  return [
    { ...clip, duration: leftDuration, audioEdit: leftEdit },
    { ...clip, id: rightId, start: beat, duration: rightDuration, audioEdit: rightEdit },
  ];
}

export function trimClipStartValue(clip: Clip, newStartBeat: number, timing: ClipTiming): Clip {
  if (clip.type === 'audio' && newStartBeat < clip.start) {
    const edit = getAudioEdit(clip);
    const earliestSourceSecond = Math.max(0, secondsAtBeat(clip.start, timing) - edit.sourceOffsetSeconds);
    const earliestSourceBeat = beatAtSeconds(earliestSourceSecond, timing);
    const start = Math.max(0, earliestSourceBeat, newStartBeat);
    const restoredBeats = clip.start - start;
    const duration = clip.duration + restoredBeats;
    return {
      ...clip,
      start,
      duration,
      audioEdit: constrainFades({
        ...edit,
        sourceOffsetSeconds: Math.max(0, edit.sourceOffsetSeconds - secondsBetweenBeats(start, clip.start, timing)),
      }, duration, 'out'),
    };
  }

  const removedBeats = assertInteriorBeat(clip, newStartBeat);
  const duration = clip.duration - removedBeats;
  if (clip.type === 'midi') {
    return {
      ...clip,
      start: newStartBeat,
      duration,
      notes: segmentNotes(clip.notes, removedBeats, clip.duration, () => crypto.randomUUID()),
    };
  }
  const edit = getAudioEdit(clip);
  return {
    ...clip,
    start: newStartBeat,
    duration,
    audioEdit: constrainFades({
      ...edit,
      sourceOffsetSeconds: edit.sourceOffsetSeconds + secondsBetweenBeats(clip.start, newStartBeat, timing),
    }, duration, 'out'),
  };
}

export function trimClipEndValue(clip: Clip, newEndBeat: number, timing: ClipTiming = 120): Clip {
  const requestedDuration = newEndBeat - clip.start;
  if (!Number.isFinite(requestedDuration) || requestedDuration < MIN_CLIP_BEATS) {
    throw new Error('Edit point must be inside the clip');
  }
  if (clip.type === 'midi') {
    return {
      ...clip,
      duration: requestedDuration,
      notes: segmentNotes(clip.notes, 0, requestedDuration, () => crypto.randomUUID()),
    };
  }
  const edit = getAudioEdit(clip);
  const sourceStartBeat = beatAtSeconds(
    Math.max(0, secondsAtBeat(clip.start, timing) - edit.sourceOffsetSeconds),
    timing,
  );
  const sourceOffsetBeats = Math.max(0, clip.start - sourceStartBeat);
  const maximumDuration = clip.originalDuration == null
    ? clip.duration
    : Math.max(MIN_CLIP_BEATS, clip.originalDuration - sourceOffsetBeats);
  const duration = Math.min(requestedDuration, maximumDuration);
  return { ...clip, duration, audioEdit: constrainFades(edit, duration, 'in') };
}

export function setClipGainValue(clip: Clip, gainDb: number): Clip {
  if (clip.type !== 'audio') return clip;
  return { ...clip, audioEdit: { ...getAudioEdit(clip), gainDb: Math.max(-60, Math.min(24, gainDb)) } };
}

export function setClipFadeValue(clip: Clip, edge: 'in' | 'out', beats: number, curve: FadeCurve): Clip {
  if (clip.type !== 'audio') return clip;
  const edit = getAudioEdit(clip);
  const next = edge === 'in'
    ? {
        ...edit,
        fadeInBeats: Math.max(0, Math.min(beats, clip.duration - Math.min(clip.duration, edit.fadeOutBeats))),
        fadeInCurve: curve,
      }
    : {
        ...edit,
        fadeOutBeats: Math.max(0, Math.min(beats, clip.duration - Math.min(clip.duration, edit.fadeInBeats))),
        fadeOutCurve: curve,
      };
  return { ...clip, audioEdit: next };
}

export function toggleClipReverseValue(clip: Clip): Clip {
  if (clip.type !== 'audio') return clip;
  const edit = getAudioEdit(clip);
  return { ...clip, audioEdit: { ...edit, reversed: !edit.reversed } };
}

export function computeClipPlaybackPlan(
  clip: Clip,
  timing: ClipTiming,
  sourceDurationSeconds?: number,
): ClipPlaybackPlan {
  const edit = getAudioEdit(clip);
  const clipEndBeat = clip.start + clip.duration;
  const requestedDurationSeconds = secondsBetweenBeats(clip.start, clipEndBeat, timing);
  const requestedOffset = Math.max(0, edit.sourceOffsetSeconds);
  const forwardOffsetSeconds = sourceDurationSeconds == null
    ? requestedOffset
    : Math.min(requestedOffset, Math.max(0, sourceDurationSeconds));
  const durationSeconds = sourceDurationSeconds == null
    ? requestedDurationSeconds
    : Math.max(0, Math.min(requestedDurationSeconds, sourceDurationSeconds - forwardOffsetSeconds));
  const sourceOffsetSeconds = edit.reversed && sourceDurationSeconds != null
    ? Math.max(0, sourceDurationSeconds - forwardOffsetSeconds - durationSeconds)
    : forwardOffsetSeconds;

  const audibleEndBeat = beatAtSeconds(secondsAtBeat(clip.start, timing) + durationSeconds, timing);
  const audibleDurationBeats = Math.max(0, audibleEndBeat - clip.start);
  const fadeInBeats = Math.min(audibleDurationBeats, Math.max(0, edit.fadeInBeats));
  const fadeOutBeats = Math.min(audibleDurationBeats - fadeInBeats, Math.max(0, edit.fadeOutBeats));
  return {
    startBeat: clip.start,
    durationBeats: audibleDurationBeats,
    durationSeconds,
    sourceOffsetSeconds,
    gainDb: Math.max(-60, Math.min(24, edit.gainDb)),
    fadeInSeconds: secondsBetweenBeats(clip.start, clip.start + fadeInBeats, timing),
    fadeOutSeconds: secondsBetweenBeats(audibleEndBeat - fadeOutBeats, audibleEndBeat, timing),
    fadeInCurve: edit.fadeInCurve,
    fadeOutCurve: edit.fadeOutCurve,
    reversed: edit.reversed,
  };
}
