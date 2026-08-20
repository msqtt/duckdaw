import { beforeEach, describe, expect, it } from 'vitest';
import { dawStore } from '../store/dawStore';
import { DUCKDAW_FORMAT_VERSION, validatePersistedProjectState } from './projectStorage';

const legacyProject = {
  projectId: 'plugin-migration',
  createdAt: '2026-08-20T00:00:00.000Z',
  projectName: 'Plugin Migration',
  bpm: 120,
  timeSignature: [4, 4] as [number, number],
  isLooping: false,
  loopStart: 0,
  loopEnd: 16,
  metronomeOn: false,
  metronomeVolume: 0.8,
  metronomeSound: 'cute' as const,
  metronomeSubdivisions: 1,
  masterVolume: 0.8,
  tracks: [{
    id: 'midi-track', name: 'Lead', type: 'midi' as const, volume: 0.8, pan: 0,
    isMuted: false, isSolo: false, instrument: 'piano' as const, color: '#fff',
    reverb: 0, delay: 0, env: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 },
    automationLanes: [], outputBusId: 'master',
  }],
  clips: [],
  markers: [],
  arrangements: [{ id: 'main', name: 'Main' }],
  activeArrangementId: 'main',
  tempoTrack: [{ id: 'tempo', beat: 0, bpm: 120, curve: 'step' as const }],
  buses: [{
    id: 'master', name: 'Master', volume: 1, pan: 0, isMuted: false,
    effects: [{ id: 'legacy-reverb', type: 'reverb' as const, enabled: true, parameters: { decay: 3 } }],
    outputBusId: null,
  }],
  sends: [],
};

describe('Plugin SDK project persistence', () => {
  beforeEach(() => {
    dawStore.getState().loadProject({ projectName: 'Reset', tracks: [], clips: [] });
  });

  it('writes the 2.1 format version', () => {
    expect(DUCKDAW_FORMAT_VERSION).toBe('2.1.0');
  });

  it('migrates legacy instruments and bus effects into canonical plugin descriptors', () => {
    dawStore.getState().loadProject(legacyProject);
    const project = dawStore.getState().getProjectData();

    expect(project.tracks[0]).toMatchObject({
      instrument: 'piano',
      instrumentPlugin: {
        pluginId: 'duckdaw.instrument.keys',
        pluginVersion: '1.0.0',
        enabled: true,
        parameters: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 },
      },
      effectPlugins: [],
    });
    expect(project.buses[0]).toMatchObject({
      effects: legacyProject.buses[0].effects,
      effectPlugins: [{
        id: 'legacy-reverb',
        pluginId: 'duckdaw.effect.reverb',
        pluginVersion: '1.0.0',
        enabled: true,
        parameters: { decay: 3 },
      }],
    });
  });

  it('preserves unknown valid plugin descriptors through Store round-trip', () => {
    const unknownInstrument = {
      id: 'unknown-inst', pluginId: 'vendor.instrument.future', pluginVersion: '4.2.0',
      enabled: true, parameters: { tone: 'glass', amount: 0.75 },
    };
    const unknownEffect = {
      id: 'unknown-fx', pluginId: 'vendor.effect.future', pluginVersion: '2.0.0',
      enabled: false, parameters: { mode: 'wide' },
    };
    dawStore.getState().loadProject({
      ...legacyProject,
      tracks: [{ ...legacyProject.tracks[0], instrumentPlugin: unknownInstrument, effectPlugins: [unknownEffect] }],
      buses: [{ ...legacyProject.buses[0], effectPlugins: [unknownEffect] }],
    });

    const project = dawStore.getState().getProjectData();
    expect(project.tracks[0].instrumentPlugin).toEqual(unknownInstrument);
    expect(project.tracks[0].effectPlugins).toEqual([unknownEffect]);
    expect(project.buses[0].effectPlugins).toEqual([unknownEffect]);
  });

  it('rejects malformed plugin descriptors before Store replacement', () => {
    expect(() => validatePersistedProjectState({
      ...legacyProject,
      tracks: [{
        ...legacyProject.tracks[0],
        instrumentPlugin: {
          id: 'bad', pluginId: 'vendor.instrument.bad', pluginVersion: '1.0.0',
          enabled: true, parameters: { amount: { nested: true } },
        },
      }],
    } as any)).toThrow(/plugin parameter/i);
  });

  it('rejects instrument plugins on audio tracks', () => {
    expect(() => validatePersistedProjectState({
      ...legacyProject,
      tracks: [{
        ...legacyProject.tracks[0], type: 'audio', instrument: undefined,
        instrumentPlugin: {
          id: 'bad-audio-inst', pluginId: 'vendor.instrument.bad', pluginVersion: '1.0.0',
          enabled: true, parameters: {},
        },
      }],
    } as any)).toThrow(/audio track.*instrument plugin/i);
  });
});
