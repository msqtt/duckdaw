import { beforeEach, describe, expect, it } from 'vitest';
import {
  dawStore,
  type PersistedProjectState,
} from './dawStore';

const fullProject: PersistedProjectState = {
  projectId: 'round-trip-id',
  createdAt: '2026-08-17T00:00:00.000Z',
  projectName: 'Round Trip Project',
  bpm: 96,
  timeSignature: [7, 8],
  isLooping: false,
  loopStart: 0,
  loopEnd: 12.5,
  metronomeOn: false,
  metronomeVolume: 0,
  metronomeSound: 'electronic',
  metronomeSubdivisions: 4,
  masterVolume: 0,
  tracks: [{
    id: 'track-a',
    name: 'Lead',
    type: 'midi',
    volume: 0,
    pan: -0.25,
    isMuted: false,
    isSolo: true,
    instrument: 'synth',
    color: '#123456',
    reverb: 0.3,
    delay: 0.2,
    env: { attack: 0.1, decay: 0.2, sustain: 0.4, release: 0.8 },
  }],
  clips: [{
    id: 'clip-a',
    trackId: 'track-a',
    arrangementId: 'alt',
    start: 0,
    duration: 8,
    type: 'midi',
    notes: [{ id: 'note-a', note: 'C4', start: 0, duration: 1, velocity: 0 }],
  }],
  markers: [{ id: 'marker-a', name: 'Intro', position: 0, color: '#654321' }],
  arrangements: [
    { id: 'main', name: 'Main' },
    { id: 'alt', name: 'Alternate' },
  ],
  activeArrangementId: 'alt',
};

describe('dawStore project replacement', () => {
  beforeEach(() => {
    dawStore.getState().loadProject({
      projectName: 'New Project',
      bpm: 120,
      tracks: [],
      clips: [],
    });
  });

  it('atomically replaces every persisted field and clears session state', () => {
    dawStore.setState({
      isPlaying: true,
      isRecording: true,
      isMicRecording: true,
      selectedTrackId: 'stale-track',
      selectedClipIds: ['stale-clip'],
      selectedNoteIds: ['stale-note'],
      clipboardClips: [fullProject.clips[0]],
      clipboardNotes: [fullProject.clips[0].notes[0]],
      exportModalOpen: true,
      isDirty: true,
    });

    dawStore.getState().loadProject(fullProject);

    expect(dawStore.getState().getProjectData()).toEqual(fullProject);
    expect(dawStore.getState()).toMatchObject({
      isPlaying: false,
      isRecording: false,
      isMicRecording: false,
      selectedTrackId: null,
      selectedClipIds: [],
      selectedNoteIds: [],
      clipboardClips: [],
      clipboardNotes: [],
      exportModalOpen: false,
      isDirty: false,
    });
  });

  it('uses fresh defaults for missing legacy fields and validates the active arrangement', () => {
    dawStore.getState().loadProject({
      projectName: 'Legacy Project',
      bpm: 90,
      tracks: [],
      clips: [],
      arrangements: [{ id: 'legacy-main', name: 'Legacy Main' }],
      activeArrangementId: 'missing',
    });

    expect(dawStore.getState().getProjectData()).toMatchObject({
      projectName: 'Legacy Project',
      bpm: 90,
      timeSignature: [4, 4],
      isLooping: false,
      loopStart: 0,
      loopEnd: 16,
      metronomeOn: false,
      metronomeVolume: 0.8,
      metronomeSound: 'cute',
      metronomeSubdivisions: 1,
      masterVolume: 0.8,
      tracks: [],
      clips: [],
      markers: [],
      arrangements: [{ id: 'legacy-main', name: 'Legacy Main' }],
      activeArrangementId: 'legacy-main',
    });
  });
});

  it('marks the project dirty for every persisted transport and master change', () => {
    const actions: Array<() => void> = [
      () => dawStore.getState().toggleLoop(),
      () => dawStore.getState().setLoopRegion(2, 8),
      () => dawStore.getState().toggleMetronome(),
      () => dawStore.getState().setMetronomeVolume(0.25),
      () => dawStore.getState().setMetronomeSound('click'),
      () => dawStore.getState().setMetronomeSubdivisions(2),
      () => dawStore.getState().setMasterVolume(0.5),
    ];

    for (const action of actions) {
      dawStore.getState().setDirty(false);
      action();
      expect(dawStore.getState().isDirty).toBe(true);
    }
  });
