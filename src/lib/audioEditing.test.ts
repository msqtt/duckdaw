import { describe, expect, it } from 'vitest';
import type { Clip } from '../store/dawStore';
import {
  computeClipPlaybackPlan,
  createDefaultAudioEdit,
  createFadeValueCurve,
  setClipFadeValue,
  splitClip,
  trimClipStartValue,
} from './audioEditing';

const audioClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'audio-1', trackId: 'track-a', arrangementId: 'main', type: 'audio',
  start: 4, duration: 8, originalDuration: 12, notes: [], bufferUrl: 'blob:shared',
  audioEdit: createDefaultAudioEdit(),
  ...overrides,
});

describe('non-destructive audio editing', () => {
  it('splits audio without changing the shared resource and offsets the right source', () => {
    const [left, right] = splitClip(audioClip(), 7, 120, () => 'right-id');
    expect(left).toMatchObject({ id: 'audio-1', start: 4, duration: 3, bufferUrl: 'blob:shared' });
    expect(right).toMatchObject({ id: 'right-id', start: 7, duration: 5, bufferUrl: 'blob:shared' });
    expect(right.audioEdit?.sourceOffsetSeconds).toBe(1.5);
  });

  it('splits MIDI notes at the boundary without changing their sounding range', () => {
    const clip: Clip = {
      id: 'midi-1', trackId: 'track-m', arrangementId: 'main', type: 'midi',
      start: 0, duration: 4, notes: [
        { id: 'cross', note: 'C4', start: 1, duration: 2, velocity: 0.8 },
        { id: 'right-note', note: 'D4', start: 3, duration: 0.5, velocity: 0.7 },
      ],
    };
    const [left, right] = splitClip(clip, 2, 120, () => 'generated');
    expect(left.notes).toEqual([{ id: 'cross', note: 'C4', start: 1, duration: 1, velocity: 0.8 }]);
    expect(right.notes.map(note => ({ start: note.start, duration: note.duration })))
      .toEqual([{ start: 0, duration: 1 }, { start: 1, duration: 0.5 }]);
  });

  it('trims an audio start by moving source offset and preserves its resource', () => {
    const trimmed = trimClipStartValue(audioClip(), 6, 120);
    expect(trimmed).toMatchObject({ start: 6, duration: 6, bufferUrl: 'blob:shared' });
    expect(trimmed.audioEdit?.sourceOffsetSeconds).toBe(1);
  });


  it('re-expands an audio trim start only as far as retained source material', () => {
    const shortened = trimClipStartValue(audioClip(), 6, 120);
    const restored = trimClipStartValue(shortened, 5, 120);
    expect(restored).toMatchObject({ start: 5, duration: 7 });
    expect(restored.audioEdit?.sourceOffsetSeconds).toBe(0.5);

    const clamped = trimClipStartValue(restored, 0, 120);
    expect(clamped).toMatchObject({ start: 4, duration: 8 });
    expect(clamped.audioEdit?.sourceOffsetSeconds).toBe(0);
  });
  it('clamps fades to clip duration and the gain/playback plan to supported bounds', () => {
    const withFadeIn = setClipFadeValue(audioClip(), 'in', 6, 'sCurve');
    const withFades = setClipFadeValue(withFadeIn, 'out', 6, 'exponential');
    expect(withFades.audioEdit).toMatchObject({ fadeInBeats: 6, fadeOutBeats: 2 });

    const plan = computeClipPlaybackPlan({
      ...withFades,
      audioEdit: { ...withFades.audioEdit!, gainDb: 99, reversed: true },
    }, 120, 10);
    expect(plan).toMatchObject({ durationSeconds: 4, gainDb: 24, reversed: true });
    expect(plan.fadeInSeconds + plan.fadeOutSeconds).toBeLessThanOrEqual(plan.durationSeconds);
    const sourceClamped = computeClipPlaybackPlan({
      ...audioClip(),
      audioEdit: { ...createDefaultAudioEdit(), sourceOffsetSeconds: 8 },
    }, 120, 10);
    expect(sourceClamped).toMatchObject({ sourceOffsetSeconds: 8, durationSeconds: 2, durationBeats: 4 });
  });


  it('creates bounded and distinct linear, exponential, s-curve, and logarithmic fades', () => {
    const curves = (['linear', 'exponential', 'sCurve', 'logarithmic'] as const)
      .map(curve => createFadeValueCurve(curve, 'in', 9));
    for (const values of curves) {
      expect(values[0]).toBe(0);
      expect(values.at(-1)).toBe(1);
      expect(values.every(value => value >= 0 && value <= 1)).toBe(true);
    }
    expect(new Set(curves.map(values => values[2].toFixed(4))).size).toBe(4);
    expect(createFadeValueCurve('sCurve', 'out', 9)).toEqual([...curves[2]].reverse());
  });
  it('rejects split/trim points outside the clip interior', () => {
    expect(() => splitClip(audioClip(), 4, 120)).toThrow(/inside/i);
    expect(() => trimClipStartValue(audioClip(), 12, 120)).toThrow(/inside/i);
  });
});


describe('dynamic tempo audio editing parity', () => {
  const tempoMap = [
    { id: 'tempo-a', beat: 0, bpm: 120, curve: 'step' as const },
    { id: 'tempo-b', beat: 4, bpm: 60, curve: 'step' as const },
  ];

  it('computes clip and edge fade seconds across tempo boundaries', () => {
    const clip = audioClip({
      start: 0,
      duration: 8,
      audioEdit: {
        ...createDefaultAudioEdit(),
        fadeInBeats: 2,
        fadeOutBeats: 2,
      },
    });
    const plan = computeClipPlaybackPlan(clip, tempoMap);
    expect(plan.durationSeconds).toBeCloseTo(6, 8);
    expect(plan.fadeInSeconds).toBeCloseTo(1, 8);
    expect(plan.fadeOutSeconds).toBeCloseTo(2, 8);
  });

  it('uses integrated elapsed seconds when splitting or trimming a source', () => {
    const clip = audioClip({ start: 0, duration: 8 });
    const [, right] = splitClip(clip, 6, tempoMap, () => 'right');
    expect(right.audioEdit?.sourceOffsetSeconds).toBeCloseTo(4, 8);

    const trimmed = trimClipStartValue(clip, 6, tempoMap);
    expect(trimmed.audioEdit?.sourceOffsetSeconds).toBeCloseTo(4, 8);
  });
});
