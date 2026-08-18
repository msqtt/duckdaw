import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dawStore } from './dawStore';

const audioTrack = {
  id: 'audio-track', name: 'Audio', type: 'audio' as const, volume: 0.8, pan: 0,
  isMuted: false, isSolo: false, color: '#ffaa00', reverb: 0, delay: 0, automationLanes: [],
};

describe('audio editing store actions', () => {
  beforeEach(() => {
    dawStore.getState().loadProject({
      projectName: 'Audio Edit', bpm: 120, tracks: [audioTrack],
      clips: [{
        id: 'audio-clip', trackId: 'audio-track', arrangementId: 'main', type: 'audio',
        start: 0, duration: 8, originalDuration: 8, notes: [], bufferUrl: 'blob:shared-audio',
      }],
      arrangements: [{ id: 'main', name: 'Main' }], activeArrangementId: 'main',
    });
    dawStore.temporal.getState().clear();
  });

  it('migrates defaults and makes split one undo step', () => {
    expect(dawStore.getState().clips[0].audioEdit).toMatchObject({ gainDb: 0, reversed: false });
    dawStore.getState().splitClipAtBeat('audio-clip', 3);
    expect(dawStore.getState().clips).toHaveLength(2);
    expect(new Set(dawStore.getState().clips.map(clip => clip.bufferUrl))).toEqual(new Set(['blob:shared-audio']));

    dawStore.temporal.getState().undo();
    expect(dawStore.getState().clips).toHaveLength(1);
    expect(dawStore.getState().clips[0]).toMatchObject({ id: 'audio-clip', duration: 8 });
  });

  it('does not revoke a shared Blob URL until its final clip owner is deleted', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    dawStore.getState().splitClipAtBeat('audio-clip', 4);
    const [left, right] = dawStore.getState().clips;

    dawStore.getState().deleteClip(left.id);
    expect(revoke).not.toHaveBeenCalled();
    dawStore.getState().deleteClip(right.id);
    expect(revoke).toHaveBeenCalledWith('blob:shared-audio');
    revoke.mockRestore();
  });

  it('clamps persisted gain/fades and toggles reverse', () => {
    dawStore.getState().setClipGain('audio-clip', 30);
    dawStore.getState().setClipFade('audio-clip', 'in', 7, 'sCurve');
    dawStore.getState().setClipFade('audio-clip', 'out', 7, 'linear');
    dawStore.getState().toggleClipReverse('audio-clip');
    expect(dawStore.getState().clips[0].audioEdit).toMatchObject({
      gainDb: 24, fadeInBeats: 7, fadeOutBeats: 1, fadeInCurve: 'sCurve', reversed: true,
    });
  });
});
