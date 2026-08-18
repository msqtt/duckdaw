import { describe, expect, it } from 'vitest';
import { filterVisibleClips, filterVisibleItems2D, getVisibleBeatRange, getVisibleIndexRange } from './virtualTimeline';

const clips = [
  { id: 'before', start: 0, duration: 4 },
  { id: 'overlap', start: 8, duration: 4 },
  { id: 'inside', start: 12, duration: 2 },
  { id: 'after', start: 30, duration: 4 },
];

describe('timeline virtualization', () => {
  it('computes a beat window with bounded overscan', () => {
    expect(getVisibleBeatRange({ scrollLeft: 500, viewportWidth: 500, pixelsPerBeat: 50, overscanBeats: 2 }))
      .toEqual({ startBeat: 8, endBeat: 22 });
  });

  it('keeps clips that overlap either edge of the visible beat window', () => {
    expect(filterVisibleClips(clips, { startBeat: 10, endBeat: 20 }).map(clip => clip.id))
      .toEqual(['overlap', 'inside']);
  });

  it('computes visible track indexes with overscan', () => {
    expect(getVisibleIndexRange({ scrollTop: 960, viewportHeight: 480, rowHeight: 96, rowCount: 100, overscanRows: 2 }))
      .toEqual({ startIndex: 8, endIndex: 17 });
  });

  it('filters items by both beat overlap and visible row range', () => {
    const notes = [
      { id: 'visible', start: 4, duration: 2, row: 10 },
      { id: 'wrong-row', start: 4, duration: 2, row: 40 },
      { id: 'wrong-beat', start: 30, duration: 2, row: 10 },
    ];
    expect(filterVisibleItems2D(
      notes,
      { startBeat: 2, endBeat: 12 },
      { startIndex: 8, endIndex: 16 },
      note => note.row,
    ).map(note => note.id)).toEqual(['visible']);
  });
});
