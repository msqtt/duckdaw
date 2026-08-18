import { beforeEach, describe, expect, it } from 'vitest';
import { dawStore, type Note, type Clip } from './dawStore';

const midiTrack = {
  id: 'midi-track', name: 'MIDI', type: 'midi' as const, volume: 0.8, pan: 0,
  isMuted: false, isSolo: false, instrument: 'synth' as const, color: '#00aaff',
  reverb: 0, delay: 0, automationLanes: [],
};

const existingNotes: Note[] = [
  { id: 'orig-1', note: 'C4', start: 0, duration: 1, velocity: 0.8 },
  { id: 'orig-2', note: 'E4', start: 1, duration: 1, velocity: 0.6 },
];

describe('REC-PRO-04: Overdub / Takes', () => {
  beforeEach(() => {
    dawStore.getState().loadProject({
      projectName: 'Overdub Test', bpm: 120,
      tracks: [midiTrack],
      clips: [{
        id: 'clip-existing',
        trackId: 'midi-track',
        arrangementId: 'main',
        start: 0,
        duration: 8,
        type: 'midi',
        notes: existingNotes,
      }],
      arrangements: [{ id: 'main', name: 'Main' }],
      activeArrangementId: 'main',
    });
    dawStore.temporal.getState().clear();
  });

  it('commitOverdubRecording creates initial take and new take', () => {
    const newNotes: Note[] = [
      { id: 'new-1', note: 'G4', start: 0, duration: 2, velocity: 0.9 },
    ];

    dawStore.getState().commitOverdubRecording('clip-existing', newNotes);

    const clip = dawStore.getState().clips.find(c => c.id === 'clip-existing')!;
    expect(clip.takes).toHaveLength(2);
    expect(clip.takes![0].name).toBe('Take 1');
    expect(clip.takes![0].notes).toEqual(existingNotes);
    expect(clip.takes![1].name).toBe('Take 2');
    expect(clip.takes![1].notes).toEqual(newNotes);
    expect(clip.activeTakeId).toBe(clip.takes![1].id);
    // Active content is the new take
    expect(clip.notes).toEqual(newNotes);
  });

  it('second overdub appends take without duplicating initial', () => {
    const take2Notes: Note[] = [{ id: 't2', note: 'A4', start: 0, duration: 1, velocity: 0.7 }];
    const take3Notes: Note[] = [{ id: 't3', note: 'B4', start: 0, duration: 1, velocity: 0.5 }];

    dawStore.getState().commitOverdubRecording('clip-existing', take2Notes);
    dawStore.getState().commitOverdubRecording('clip-existing', take3Notes);

    const clip = dawStore.getState().clips.find(c => c.id === 'clip-existing')!;
    expect(clip.takes).toHaveLength(3);
    expect(clip.takes![0].name).toBe('Take 1');
    expect(clip.takes![1].name).toBe('Take 2');
    expect(clip.takes![2].name).toBe('Take 3');
    expect(clip.activeTakeId).toBe(clip.takes![2].id);
    expect(clip.notes).toEqual(take3Notes);
  });

  it('switchTake changes active content', () => {
    const newNotes: Note[] = [{ id: 'n', note: 'F4', start: 0, duration: 1, velocity: 0.5 }];
    dawStore.getState().commitOverdubRecording('clip-existing', newNotes);

    const clip = dawStore.getState().clips.find(c => c.id === 'clip-existing')!;
    const initialTakeId = clip.takes![0].id;

    dawStore.getState().switchTake('clip-existing', initialTakeId);

    const updated = dawStore.getState().clips.find(c => c.id === 'clip-existing')!;
    expect(updated.activeTakeId).toBe(initialTakeId);
    expect(updated.notes).toEqual(existingNotes);
  });

  it('undo commitOverdubRecording restores full previous state (single step)', () => {
    const newNotes: Note[] = [{ id: 'n', note: 'D4', start: 0, duration: 1, velocity: 0.9 }];
    dawStore.getState().commitOverdubRecording('clip-existing', newNotes);

    // Verify overdub happened
    expect(dawStore.getState().clips[0].takes).toHaveLength(2);

    // Single undo
    dawStore.temporal.getState().undo();

    const restored = dawStore.getState().clips.find(c => c.id === 'clip-existing')!;
    expect(restored.takes).toBeUndefined();
    expect(restored.activeTakeId).toBeUndefined();
    expect(restored.notes).toEqual(existingNotes);
  });

  it('overdub does not affect other clips', () => {
    // Add another clip
    dawStore.getState().addClip('midi-track', 16);
    const otherClipId = dawStore.getState().clips.find(c => c.id !== 'clip-existing')!.id;

    dawStore.getState().commitOverdubRecording('clip-existing', [
      { id: 'x', note: 'C5', start: 0, duration: 1, velocity: 1 },
    ]);

    const other = dawStore.getState().clips.find(c => c.id === otherClipId)!;
    expect(other.takes).toBeUndefined();
    expect(other.activeTakeId).toBeUndefined();
  });

  it('take notes are deep copied (not shared references)', () => {
    const newNotes: Note[] = [{ id: 'n', note: 'C4', start: 0, duration: 1, velocity: 0.8 }];
    dawStore.getState().commitOverdubRecording('clip-existing', newNotes);

    const clip = dawStore.getState().clips.find(c => c.id === 'clip-existing')!;
    // Mutating the source array should not affect stored takes
    newNotes[0].velocity = 0.1;
    expect(clip.takes![1].notes![0].velocity).toBe(0.8);
  });

  it('commitOverdubRecording on non-existent clip is a no-op', () => {
    const before = dawStore.getState().clips;
    dawStore.getState().commitOverdubRecording('non-existent', []);
    expect(dawStore.getState().clips).toEqual(before);
  });

  it('marks project dirty after overdub', () => {
    dawStore.getState().setDirty(false);
    dawStore.getState().commitOverdubRecording('clip-existing', [
      { id: 'x', note: 'C5', start: 0, duration: 1, velocity: 1 },
    ]);
    expect(dawStore.getState().isDirty).toBe(true);
  });
});
