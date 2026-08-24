import { beforeEach, describe, expect, it } from 'vitest';
import { dawStore } from './dawStore';
import { automationUiStore } from './automationUiStore';

const trackId = 'track-1';

describe('AUTO-T02 control-to-lane workflow', () => {
  beforeEach(() => {
    dawStore.setState(state => ({
      tracks: state.tracks.map(track => track.id === trackId ? { ...track, automationLanes: [] } : track),
      isDirty: false,
    }));
    dawStore.temporal.getState().clear();
    automationUiStore.getState().clear();
  });

  it('ensures one lane with a beat-zero current value in one undo transaction', () => {
    const laneId = dawStore.getState().ensureAutomationLane(trackId, {
      target: 'volume', label: 'Volume', range: { min: 0, max: 1 }, valueType: 'continuous',
    }, 0.73);
    const track = dawStore.getState().tracks.find(candidate => candidate.id === trackId)!;
    expect(laneId).toBe(track.automationLanes[0].id);
    expect(track.automationLanes[0]).toMatchObject({
      target: 'volume', label: 'Volume', enabled: true,
      points: [{ beat: 0, value: 0.73, curve: 'step' }],
    });
    expect(dawStore.getState().isDirty).toBe(true);

    dawStore.temporal.getState().undo();
    expect(dawStore.getState().tracks.find(candidate => candidate.id === trackId)!.automationLanes).toEqual([]);
  });

  it('returns the existing lane without dirtying or adding undo history, and UI activation stays session-only', () => {
    const binding = { target: 'effect:fx-1:drive' as const, label: 'Drive', range: { min: 0, max: 1 }, valueType: 'continuous' as const };
    const laneId = dawStore.getState().ensureAutomationLane(trackId, binding, 0.4)!;
    dawStore.setState({ isDirty: false });
    dawStore.temporal.getState().clear();
    const beforeTracks = dawStore.getState().tracks;

    expect(dawStore.getState().ensureAutomationLane(trackId, binding, 0.8)).toBe(laneId);
    expect(dawStore.getState().tracks).toBe(beforeTracks);
    expect(dawStore.getState().isDirty).toBe(false);

    automationUiStore.getState().activate(trackId, laneId);
    expect(automationUiStore.getState().activeLaneByTrack[trackId]).toBe(laneId);
    expect(dawStore.getState().isDirty).toBe(false);
  });
});
