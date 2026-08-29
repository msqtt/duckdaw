import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dawStore } from '../store/dawStore';
import { startAudioRecordingWithPlayback } from './audioRecording';

describe('REC-PRO-05: Audio Track recording with accompaniment playback', () => {
  beforeEach(() => {
    dawStore.setState({ isPlaying: false, isMicRecording: false });
  });

  it('starts capture before sampling the beat and starting playback', async () => {
    const calls: string[] = [];

    const startBeat = await startAudioRecordingWithPlayback({
      startCapture: async () => { calls.push('capture'); },
      getCurrentBeat: () => { calls.push('beat'); return 12.5; },
      isPlaybackActive: () => false,
      startPlayback: () => { calls.push('play'); },
    });

    expect(startBeat).toBe(12.5);
    expect(calls).toEqual(['capture', 'beat', 'play']);
  });

  it('does not restart, pause, stop, or seek playback that is already active', async () => {
    const startPlayback = vi.fn();
    const getCurrentBeat = vi.fn(() => 24);

    const startBeat = await startAudioRecordingWithPlayback({
      startCapture: vi.fn(async () => undefined),
      getCurrentBeat,
      isPlaybackActive: () => true,
      startPlayback,
    });

    expect(startBeat).toBe(24);
    expect(getCurrentBeat).toHaveBeenCalledOnce();
    expect(startPlayback).not.toHaveBeenCalled();
  });

  it('does not sample a beat or start playback when capture permission fails', async () => {
    const error = new Error('permission denied');
    const getCurrentBeat = vi.fn(() => 8);
    const startPlayback = vi.fn();
    const rollbackPlaybackOnAbort = vi.fn();

    await expect(startAudioRecordingWithPlayback({
      startCapture: vi.fn(async () => { throw error; }),
      rollbackPlaybackOnAbort,
      getCurrentBeat,
      isPlaybackActive: () => false,
      startPlayback,
    })).rejects.toBe(error);

    expect(getCurrentBeat).not.toHaveBeenCalled();
    expect(startPlayback).not.toHaveBeenCalled();
    expect(rollbackPlaybackOnAbort).toHaveBeenCalledOnce();
  });

  it('cancels and releases capture without starting playback when recording was disarmed while awaiting permission', async () => {
    const cancelCapture = vi.fn(async () => undefined);
    const rollbackPlaybackOnAbort = vi.fn();
    const getCurrentBeat = vi.fn(() => 16);
    const startPlayback = vi.fn();

    const startBeat = await startAudioRecordingWithPlayback({
      startCapture: vi.fn(async () => undefined),
      cancelCapture,
      rollbackPlaybackOnAbort,
      isRecordingArmed: () => false,
      getCurrentBeat,
      isPlaybackActive: () => false,
      startPlayback,
    });

    expect(startBeat).toBeNull();
    expect(cancelCapture).toHaveBeenCalledOnce();
    expect(rollbackPlaybackOnAbort).toHaveBeenCalledOnce();
    expect(getCurrentBeat).not.toHaveBeenCalled();
    expect(startPlayback).not.toHaveBeenCalled();
  });

  it('does not claim playback started merely because microphone recording was armed', () => {
    dawStore.getState().toggleMicRecording();
    expect(dawStore.getState()).toMatchObject({
      isMicRecording: true,
      isPlaying: false,
    });

    dawStore.getState().toggleMicRecording();
    expect(dawStore.getState()).toMatchObject({
      isMicRecording: false,
      isPlaying: false,
    });
  });
});
