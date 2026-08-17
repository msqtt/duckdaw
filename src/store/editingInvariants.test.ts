import { beforeEach, describe, expect, it } from 'vitest';
import { dawStore } from './dawStore';

const midiTrack = {
  id: 'midi-track', name: 'MIDI', type: 'midi' as const, volume: 0.8, pan: 0,
  isMuted: false, isSolo: false, instrument: 'synth' as const, color: '#00aaff',
  reverb: 0, delay: 0,
};
const audioTrack = {
  id: 'audio-track', name: 'Audio', type: 'audio' as const, volume: 0.8, pan: 0,
  isMuted: false, isSolo: false, color: '#ffaa00', reverb: 0, delay: 0,
};

describe('arrangement and editing invariants', () => {
  beforeEach(() => {
    dawStore.getState().loadProject({
      projectName: 'Editing', bpm: 120,
      tracks: [midiTrack, audioTrack], clips: [],
      arrangements: [{ id: 'main', name: 'Main' }], activeArrangementId: 'main',
    });
    dawStore.temporal.getState().clear();
  });

  it('assigns clips to the active arrangement and isolates arrangement content', () => {
    dawStore.getState().addClip('midi-track', 0);
    const mainClip = dawStore.getState().clips[0];
    expect(mainClip.arrangementId).toBe('main');

    dawStore.getState().addArrangement('Alternate');
    const alternateId = dawStore.getState().activeArrangementId!;
    expect(alternateId).not.toBe('main');
    dawStore.getState().addClip('midi-track', 4);

    const mainClips = dawStore.getState().clips.filter(clip => clip.arrangementId === 'main');
    const alternateClips = dawStore.getState().clips.filter(clip => clip.arrangementId === alternateId);
    expect(mainClips.map(clip => clip.id)).toEqual([mainClip.id]);
    expect(alternateClips).toHaveLength(1);
  });

  it('copies the current arrangement with fresh clip and note identities', () => {
    dawStore.getState().addClip('midi-track', 0);
    const source = dawStore.getState().clips[0];
    dawStore.getState().addNote(source.id, {
      id: 'source-note', note: 'C4', start: 0, duration: 1, velocity: 0.8,
    });
    const sourceWithNote = dawStore.getState().clips[0];

    dawStore.getState().addArrangement('Copy', true);

    const copyId = dawStore.getState().activeArrangementId!;
    const copied = dawStore.getState().clips.find(clip => clip.arrangementId === copyId)!;
    expect(copied).toBeDefined();
    expect(copied.id).not.toBe(sourceWithNote.id);
    expect(copied.notes).toHaveLength(1);
    expect(copied.notes[0]).toMatchObject({ note: 'C4', start: 0, duration: 1, velocity: 0.8 });
    expect(copied.notes[0].id).not.toBe(sourceWithNote.notes[0].id);
  });

  it('removes clips owned by a deleted arrangement and keeps another arrangement active', () => {
    dawStore.getState().addClip('midi-track', 0);
    dawStore.getState().addArrangement('Alternate');
    const alternateId = dawStore.getState().activeArrangementId!;
    dawStore.getState().addClip('midi-track', 4);

    dawStore.getState().deleteArrangement(alternateId);

    expect(dawStore.getState().arrangements).toEqual([{ id: 'main', name: 'Main' }]);
    expect(dawStore.getState().activeArrangementId).toBe('main');
    expect(dawStore.getState().clips.every(clip => clip.arrangementId === 'main')).toBe(true);
  });

  it('does not delete the final arrangement', () => {
    dawStore.getState().deleteArrangement('main');
    expect(dawStore.getState().arrangements).toEqual([{ id: 'main', name: 'Main' }]);
    expect(dawStore.getState().activeArrangementId).toBe('main');
  });

  it('rejects moving a clip onto an incompatible track type', () => {
    dawStore.getState().addClip('midi-track', 0);
    const clipId = dawStore.getState().clips[0].id;

    dawStore.getState().updateClip(clipId, { trackId: 'audio-track' });

    expect(dawStore.getState().clips[0].trackId).toBe('midi-track');
  });

  it('pastes a deep copy after the source clip was cut', () => {
    dawStore.getState().addClip('midi-track', 0);
    const source = dawStore.getState().clips[0];
    dawStore.getState().setClipboard('clips', [source]);
    dawStore.getState().deleteClip(source.id);

    dawStore.getState().pasteClips(8);

    const [pasted] = dawStore.getState().clips;
    expect(pasted).toMatchObject({ trackId: 'midi-track', start: 8, arrangementId: 'main' });
    expect(pasted.id).not.toBe(source.id);
  });

  it('includes marker edits in undo history', () => {
    dawStore.getState().addMarker(4, 'Verse');
    expect(dawStore.getState().markers).toHaveLength(1);

    dawStore.temporal.getState().undo();

    expect(dawStore.getState().markers).toEqual([]);
  });
});
