import { describe, expect, it } from 'vitest';
import { createTrackMixSettings } from './mixSettings';

const baseTrack = {
  id: 'track-1', name: 'Track', type: 'midi' as const,
  volume: 0.5, pan: -0.25, isMuted: true, isSolo: false,
  instrument: 'synth' as const, color: '#fff', reverb: 0.4, delay: 0.2,
};

describe('shared realtime/offline mix settings', () => {
  it('maps all track mix parameters to the common audio graph plan', () => {
    expect(createTrackMixSettings(baseTrack)).toEqual({
      volumeDb: 20 * Math.log10(0.5),
      pan: -0.25,
      muted: true,
      solo: false,
      reverbWet: 0.4,
      delayWet: 0.2,
    });
  });

  it('maps zero linear gain to silence', () => {
    expect(createTrackMixSettings({ ...baseTrack, volume: 0 }).volumeDb).toBe(-Infinity);
  });
});
