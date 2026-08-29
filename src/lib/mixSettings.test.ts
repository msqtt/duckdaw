import { describe, expect, it } from 'vitest';
import { createTrackMixSettings, resolveTrackAudibility } from './mixSettings';

const baseTrack = {
  id: 'track-1', name: 'Track', type: 'midi' as const,
  volume: 0.5, pan: -0.25, isMuted: true, isSolo: false,
  instrument: 'synth' as const, color: '#fff', reverb: 0.4, delay: 0.2, automationLanes: [],
};

describe('shared realtime/offline mix settings', () => {
  it('maps all track mix parameters without delegating to Tone global solo', () => {
    expect(createTrackMixSettings(baseTrack, false)).toEqual({
      volumeDb: 20 * Math.log10(0.5),
      pan: -0.25,
      muted: true,
      reverbWet: 0.4,
      delayWet: 0.2,
    });
  });

  it('maps zero linear gain to silence', () => {
    expect(createTrackMixSettings({ ...baseTrack, volume: 0 }, false).volumeDb).toBe(-Infinity);
  });

  it('centralizes no-solo, multi-solo and solo-plus-mute audibility', () => {
    const tracks = [
      { ...baseTrack, id: 'a', isMuted: false, isSolo: true },
      { ...baseTrack, id: 'b', isMuted: false, isSolo: true },
      { ...baseTrack, id: 'c', isMuted: false, isSolo: false },
      { ...baseTrack, id: 'd', isMuted: true, isSolo: true },
    ];
    expect(resolveTrackAudibility(tracks)).toEqual(new Map([
      ['a', true], ['b', true], ['c', false], ['d', false],
    ]));
    expect(createTrackMixSettings(tracks[2], true).muted).toBe(true);
    expect(resolveTrackAudibility(tracks.map(track => ({ ...track, isSolo: false })))).toEqual(new Map([
      ['a', true], ['b', true], ['c', true], ['d', false],
    ]));
  });
});
