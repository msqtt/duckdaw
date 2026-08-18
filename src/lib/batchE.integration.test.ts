import { describe, it, expect, beforeEach } from 'vitest';
import { dawStore } from '../store/dawStore';
import type { TempoPoint } from './tempoMap';
import type { AutomationLane } from './automation';

/**
 * Batch E Integration: AUTO-01 + TEMPO-01 + FORMAT-02
 * These tests verify real product integration:
 * - dawStore exposes tempoTrack and automationLanes
 * - Actions are atomic, set dirty, and support undo
 * - setBpm keeps beat-0 tempo point in sync
 * - v1.x migration generates default tempo point
 */
describe('AUTO-01/TEMPO-01 Store Integration', () => {
  beforeEach(() => {
    // Reset store to a clean default
    dawStore.getState().loadProject({
      projectId: 'test-project',
      createdAt: '2026-01-01T00:00:00Z',
      projectName: 'Test',
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
      tracks: [
        { id: 'track-1', name: 'Synth', type: 'midi', volume: 0.8, pan: 0, isMuted: false, isSolo: false, instrument: 'synth', color: '#0ea5e9', reverb: 0.2, delay: 0, automationLanes: [] },
      ],
      clips: [],
      markers: [],
      arrangements: [{ id: 'main', name: 'Main' }],
      activeArrangementId: 'main',
    });
    dawStore.temporal.getState().clear();
  });

  describe('tempoTrack in store', () => {
    it('loadProject without tempoTrack generates default at beat 0', () => {
      const state = dawStore.getState();
      expect(state.tempoTrack).toBeDefined();
      expect(state.tempoTrack.length).toBeGreaterThanOrEqual(1);
      expect(state.tempoTrack[0].beat).toBe(0);
      expect(state.tempoTrack[0].bpm).toBe(120);
      expect(state.tempoTrack[0].curve).toBe('step');
    });

    it('setTempoPoints updates the tempo track and marks dirty', () => {
      const points: TempoPoint[] = [
        { id: 'tp0', beat: 0, bpm: 100, curve: 'linear' },
        { id: 'tp1', beat: 8, bpm: 140, curve: 'step' },
      ];
      dawStore.getState().setTempoPoints(points);
      const state = dawStore.getState();
      expect(state.tempoTrack).toEqual(points);
      expect(state.isDirty).toBe(true);
    });

    it('setTempoPoints rejects invalid map (no point at beat 0)', () => {
      const points: TempoPoint[] = [
        { id: 'tp1', beat: 4, bpm: 140, curve: 'step' },
      ];
      dawStore.getState().setTempoPoints(points);
      // Should not change
      expect(dawStore.getState().tempoTrack[0].beat).toBe(0);
    });

    it('setBpm keeps beat-0 tempo point in sync', () => {
      dawStore.getState().setBpm(90);
      const state = dawStore.getState();
      expect(state.bpm).toBe(90);
      expect(state.tempoTrack[0].bpm).toBe(90);
    });

    it('setTempoPoints is undoable', () => {
      const initial = [...dawStore.getState().tempoTrack];
      dawStore.getState().setTempoPoints([
        { id: 'tp0', beat: 0, bpm: 200, curve: 'step' },
      ]);
      expect(dawStore.getState().tempoTrack[0].bpm).toBe(200);
      dawStore.temporal.getState().undo();
      expect(dawStore.getState().tempoTrack[0].bpm).toBe(initial[0].bpm);
    });
  });

  describe('automationLanes in Track', () => {
    it('tracks have automationLanes array (empty by default)', () => {
      const track = dawStore.getState().tracks[0];
      expect(track.automationLanes).toBeDefined();
      expect(Array.isArray(track.automationLanes)).toBe(true);
      expect(track.automationLanes.length).toBe(0);
    });

    it('addAutomationLane adds a lane to the selected track', () => {
      dawStore.getState().addAutomationLane('track-1', 'volume');
      const track = dawStore.getState().tracks.find(t => t.id === 'track-1')!;
      expect(track.automationLanes.length).toBe(1);
      expect(track.automationLanes[0].target).toBe('volume');
      expect(track.automationLanes[0].enabled).toBe(true);
      expect(track.automationLanes[0].points).toEqual([]);
      expect(dawStore.getState().isDirty).toBe(true);
    });

    it('addAutomationPoint adds a point to a lane', () => {
      dawStore.getState().addAutomationLane('track-1', 'volume');
      const laneId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].id;
      dawStore.getState().addAutomationPoint('track-1', laneId, { beat: 0, value: 0.5, curve: 'step' });
      dawStore.getState().addAutomationPoint('track-1', laneId, { beat: 4, value: 1.0, curve: 'linear' });
      const lane = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0];
      expect(lane.points.length).toBe(2);
      expect(lane.points[0].beat).toBe(0);
      expect(lane.points[1].beat).toBe(4);
    });

    it('updateAutomationPoint updates value and curve', () => {
      dawStore.getState().addAutomationLane('track-1', 'pan');
      const laneId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].id;
      dawStore.getState().addAutomationPoint('track-1', laneId, { beat: 0, value: -0.5, curve: 'step' });
      const pointId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].points[0].id;
      dawStore.getState().updateAutomationPoint('track-1', laneId, pointId, { value: 0.3, curve: 'linear' });
      const point = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].points[0];
      expect(point.value).toBe(0.3);
      expect(point.curve).toBe('linear');
    });

    it('deleteAutomationPoint removes a point', () => {
      dawStore.getState().addAutomationLane('track-1', 'volume');
      const laneId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].id;
      dawStore.getState().addAutomationPoint('track-1', laneId, { beat: 0, value: 0.5, curve: 'step' });
      const pointId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].points[0].id;
      dawStore.getState().deleteAutomationPoint('track-1', laneId, pointId);
      expect(dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].points.length).toBe(0);
    });

    it('toggleAutomationLane toggles enabled state', () => {
      dawStore.getState().addAutomationLane('track-1', 'delay');
      const laneId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].id;
      expect(dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].enabled).toBe(true);
      dawStore.getState().toggleAutomationLane('track-1', laneId);
      expect(dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].enabled).toBe(false);
    });

    it('deleteAutomationLane removes the lane', () => {
      dawStore.getState().addAutomationLane('track-1', 'volume');
      const laneId = dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes[0].id;
      dawStore.getState().deleteAutomationLane('track-1', laneId);
      expect(dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes.length).toBe(0);
    });

    it('automation lane actions are undoable', () => {
      dawStore.getState().addAutomationLane('track-1', 'volume');
      expect(dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes.length).toBe(1);
      dawStore.temporal.getState().undo();
      expect(dawStore.getState().tracks.find(t => t.id === 'track-1')!.automationLanes.length).toBe(0);
    });
  });

  describe('getProjectData includes new fields', () => {
    it('getProjectData returns tempoTrack', () => {
      const data = dawStore.getState().getProjectData();
      expect(data.tempoTrack).toBeDefined();
      expect(data.tempoTrack.length).toBeGreaterThanOrEqual(1);
    });

    it('getProjectData returns tracks with automationLanes', () => {
      dawStore.getState().addAutomationLane('track-1', 'volume');
      const data = dawStore.getState().getProjectData();
      expect(data.tracks[0].automationLanes).toBeDefined();
      expect(data.tracks[0].automationLanes.length).toBe(1);
    });
  });
});
