import type { Track } from '../store/dawStore';

export interface TrackMixSettings {
  volumeDb: number;
  pan: number;
  muted: boolean;
  reverbWet: number;
  delayWet: number;
}

export function resolveTrackAudibility(
  tracks: readonly Pick<Track, 'id' | 'isMuted' | 'isSolo'>[],
): Map<string, boolean> {
  const hasSolo = tracks.some(track => track.isSolo);
  return new Map(tracks.map(track => [
    track.id,
    !track.isMuted && (!hasSolo || track.isSolo),
  ]));
}

export function createTrackMixSettings(track: Track, hasSolo: boolean = false): TrackMixSettings {
  return {
    volumeDb: track.volume === 0 ? -Infinity : 20 * Math.log10(track.volume),
    pan: track.pan,
    muted: track.isMuted || (hasSolo && !track.isSolo),
    reverbWet: track.reverb ?? 0,
    delayWet: track.delay ?? 0,
  };
}
