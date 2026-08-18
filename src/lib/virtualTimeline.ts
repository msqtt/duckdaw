export interface BeatRange {
  startBeat: number;
  endBeat: number;
}

export function getVisibleBeatRange(input: {
  scrollLeft: number;
  viewportWidth: number;
  pixelsPerBeat: number;
  overscanBeats?: number;
}): BeatRange {
  const pixelsPerBeat = Math.max(0.0001, input.pixelsPerBeat);
  const overscan = Math.max(0, input.overscanBeats ?? 4);
  return {
    startBeat: Math.max(0, input.scrollLeft / pixelsPerBeat - overscan),
    endBeat: Math.max(0, (input.scrollLeft + input.viewportWidth) / pixelsPerBeat + overscan),
  };
}

export function filterVisibleClips<T extends { start: number; duration: number }>(clips: T[], range: BeatRange): T[] {
  return clips.filter(clip => clip.start < range.endBeat && clip.start + clip.duration > range.startBeat);
}

export function getVisibleIndexRange(input: {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  rowCount: number;
  overscanRows?: number;
}): { startIndex: number; endIndex: number } {
  const rowHeight = Math.max(1, input.rowHeight);
  const overscan = Math.max(0, Math.floor(input.overscanRows ?? 2));
  const startIndex = Math.max(0, Math.floor(input.scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    Math.max(0, input.rowCount),
    Math.ceil((input.scrollTop + input.viewportHeight) / rowHeight) + overscan,
  );
  return { startIndex, endIndex };
}

export function filterVisibleItems2D<T extends { start: number; duration: number }>(
  items: T[],
  beatRange: BeatRange,
  rowRange: { startIndex: number; endIndex: number },
  getRowIndex: (item: T) => number,
): T[] {
  return items.filter(item => {
    const row = getRowIndex(item);
    return item.start < beatRange.endBeat
      && item.start + item.duration > beatRange.startBeat
      && row >= rowRange.startIndex
      && row < rowRange.endIndex;
  });
}
