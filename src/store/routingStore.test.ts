import { beforeEach, describe, expect, it } from 'vitest';
import { dawStore } from '../store/dawStore';

function resetLegacyProject() {
  dawStore.getState().loadProject({
    projectId: 'routing-project',
    createdAt: '2026-01-01T00:00:00.000Z',
    projectName: 'Routing',
    bpm: 120,
    timeSignature: [4, 4],
    isLooping: false,
    loopStart: 0,
    loopEnd: 16,
    metronomeOn: false,
    metronomeVolume: 0.8,
    metronomeSound: 'cute',
    metronomeSubdivisions: 1,
    masterVolume: 0.8,
    tracks: [{
      id: 'track', name: 'Track', type: 'audio', volume: 1, pan: 0,
      isMuted: false, isSolo: false, color: '#fff', reverb: 0, delay: 0,
      automationLanes: [],
    }],
    clips: [],
    markers: [],
    arrangements: [{ id: 'main', name: 'Main' }],
    activeArrangementId: 'main',
  });
  dawStore.temporal.getState().clear();
}

describe('Bus/Send Store routing transactions', () => {
  beforeEach(resetLegacyProject);

  it('migrates a legacy project to one master bus and routes every track', () => {
    const state = dawStore.getState();
    expect(state.buses).toEqual([expect.objectContaining({ id: 'master', outputBusId: null })]);
    expect(state.tracks[0].outputBusId).toBe('master');
    expect(state.sends).toEqual([]);
  });

  it('adds buses and rejects an output edit that would form a cycle', () => {
    dawStore.getState().addBus('Group A');
    dawStore.getState().addBus('Group B');
    const [a, b] = dawStore.getState().buses.filter(bus => bus.id !== 'master');
    dawStore.getState().updateBus(a.id, { outputBusId: b.id });
    expect(dawStore.getState().buses.find(bus => bus.id === a.id)?.outputBusId).toBe(b.id);

    dawStore.getState().updateBus(b.id, { outputBusId: a.id });
    expect(dawStore.getState().buses.find(bus => bus.id === b.id)?.outputBusId).toBe('master');
  });

  it('rejects a send that closes a bus cycle and preserves the previous graph', () => {
    dawStore.getState().addBus('Group');
    const group = dawStore.getState().buses.find(bus => bus.id !== 'master')!;
    dawStore.getState().addSend({ sourceBusId: 'master', targetBusId: group.id, gain: 0.5, preFader: false });
    expect(dawStore.getState().sends).toEqual([]);
  });

  it('routes a track and creates a pre-fader send as one undoable action each', () => {
    dawStore.getState().addBus('FX');
    const fx = dawStore.getState().buses.find(bus => bus.id !== 'master')!;
    dawStore.temporal.getState().clear();

    dawStore.getState().setTrackOutputBus('track', fx.id);
    expect(dawStore.getState().tracks[0].outputBusId).toBe(fx.id);
    dawStore.temporal.getState().undo();
    expect(dawStore.getState().tracks[0].outputBusId).toBe('master');

    dawStore.getState().addSend({ sourceTrackId: 'track', targetBusId: fx.id, gain: 0.25, preFader: true });
    expect(dawStore.getState().sends).toEqual([expect.objectContaining({ sourceTrackId: 'track', preFader: true })]);
    dawStore.temporal.getState().undo();
    expect(dawStore.getState().sends).toEqual([]);
  });

  it('does not delete a referenced bus, then deletes it after references are removed', () => {
    dawStore.getState().addBus('Group');
    const group = dawStore.getState().buses.find(bus => bus.id !== 'master')!;
    dawStore.getState().setTrackOutputBus('track', group.id);
    dawStore.getState().deleteBus(group.id);
    expect(dawStore.getState().buses.some(bus => bus.id === group.id)).toBe(true);

    dawStore.getState().setTrackOutputBus('track', 'master');
    dawStore.getState().deleteBus(group.id);
    expect(dawStore.getState().buses.some(bus => bus.id === group.id)).toBe(false);
  });
});
