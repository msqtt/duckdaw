import type { Track } from '../store/dawStore';

export interface TrackMixSettings {
  volumeDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  reverbWet: number;
  delayWet: number;
}

export function createTrackMixSettings(track: Track): TrackMixSettings {
  return {
    volumeDb: track.volume === 0 ? -Infinity : 20 * Math.log10(track.volume),
    pan: track.pan,
    muted: track.isMuted,
    solo: track.isSolo,
    reverbWet: track.reverb ?? 0,
    delayWet: track.delay ?? 0,
  };
}
