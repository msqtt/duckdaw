import { beforeEach, describe, expect, it } from 'vitest';
import { dawStore, type Note } from './dawStore';

const midiTrack = {
  id: 'midi-track', name: 'MIDI', type: 'midi' as const, volume: 0.8, pan: 0,
  isMuted: false, isSolo: false, instrument: 'synth' as const, color: '#00aaff',
  reverb: 0, delay: 0, automationLanes: [],
};

const notes: Note[] = [
  { id: 'n1', note: 'C4', start: 0, duration: 1, velocity: 0.8 },
  { id: 'n2', note: 'E4', start: 1, duration: 1, velocity: 0.6 },
  { id: 'n3', note: 'G4', start: 2, duration: 0.5, velocity: 0.9 },
];

describe('MIDI-EDIT-02: Store transformNotesInClip (single undo)', () => {
  beforeEach(() => {
    dawStore.getState().loadProject({
      projectName: 'Transform Test', bpm: 120,
      tracks: [midiTrack],
      clips: [{
        id: 'clip-t',
        trackId: 'midi-track',
        arrangementId: 'main',
        start: 0,
        duration: 8,
        type: 'midi',
        notes,
      }],
      arrangements: [{ id: 'main', name: 'Main' }],
      activeArrangementId: 'main',
    });
    dawStore.temporal.getState().clear();
  });

  it('transpose+humanize+legato applies as one undo step', () => {
    dawStore.getState().transformNotesInClip('clip-t', ['n1', 'n2', 'n3'], {
      transpose: 2,
      humanize: { amount: 0.05, seed: 42 },
      legato: true,
    });

    const clip = dawStore.getState().clips.find(c => c.id === 'clip-t')!;
    expect(clip.notes[0].note).toBe('D4'); // C4 + 2 semitones
    expect(clip.notes[1].note).toBe('F#4'); // E4 + 2 semitones

    // Single undo restores all
    dawStore.temporal.getState().undo();
    const restored = dawStore.getState().clips.find(c => c.id === 'clip-t')!;
    expect(restored.notes).toEqual(notes);
  });

  it('velocity change is single undo step', () => {
    dawStore.getState().transformNotesInClip('clip-t', ['n1', 'n2'], { velocity: 0.3 });

    const clip = dawStore.getState().clips.find(c => c.id === 'clip-t')!;
    expect(clip.notes[0].velocity).toBe(0.3);
    expect(clip.notes[1].velocity).toBe(0.3);
    expect(clip.notes[2].velocity).toBe(0.9); // unchanged

    dawStore.temporal.getState().undo();
    const restored = dawStore.getState().clips.find(c => c.id === 'clip-t')!;
    expect(restored.notes[0].velocity).toBe(0.8);
    expect(restored.notes[1].velocity).toBe(0.6);
  });

  it('marks project dirty', () => {
    dawStore.getState().setDirty(false);
    dawStore.getState().transformNotesInClip('clip-t', ['n1'], { transpose: 1 });
    expect(dawStore.getState().isDirty).toBe(true);
  });

  it('no-op on non-existent clip', () => {
    const before = dawStore.getState().clips;
    dawStore.getState().transformNotesInClip('non-existent', ['n1'], { transpose: 1 });
    expect(dawStore.getState().clips).toEqual(before);
  });

  it('no-op on audio clip', () => {
    dawStore.getState().loadProject({
      projectName: 'Audio', bpm: 120,
      tracks: [{ ...midiTrack, id: 'at', type: 'audio' as const, instrument: undefined }],
      clips: [{
        id: 'ac', trackId: 'at', arrangementId: 'main',
        start: 0, duration: 4, type: 'audio' as const, notes: [],
      }],
      arrangements: [{ id: 'main', name: 'Main' }], activeArrangementId: 'main',
    });
    const before = dawStore.getState().clips;
    dawStore.getState().transformNotesInClip('ac', [], { transpose: 1 });
    expect(dawStore.getState().clips).toEqual(before);
  });
});
