import { describe, expect, it } from 'vitest';
import {
  createDefaultRouting,
  validateRoutingGraph,
  type Bus,
  type RoutingTrack,
  type Send,
} from './routingGraph';

const bus = (id: string, outputBusId: string | null): Bus => ({
  id,
  name: id,
  volume: 1,
  pan: 0,
  isMuted: false,
  effects: [],
  outputBusId,
});
const track = (id: string, outputBusId: string): RoutingTrack => ({ id, outputBusId });

describe('routing graph DAG', () => {
  it('accepts track -> group -> master -> destination and returns dependency order', () => {
    const result = validateRoutingGraph(
      [track('track', 'group')],
      [bus('master', null), bus('group', 'master')],
      [],
    );
    expect(result.busOrder.indexOf('group')).toBeLessThan(result.busOrder.indexOf('master'));
  });

  it('includes pre/post fader sends as graph edges', () => {
    const sends: Send[] = [
      { id: 'send-track', sourceTrackId: 'track', targetBusId: 'fx', gain: 0.5, preFader: true },
      { id: 'send-bus', sourceBusId: 'fx', targetBusId: 'master', gain: 0.25, preFader: false },
    ];
    expect(() => validateRoutingGraph(
      [track('track', 'master')],
      [bus('master', null), bus('fx', 'master')],
      sends,
    )).not.toThrow();
  });

  it.each([
    {
      name: 'output cycle',
      tracks: [] as RoutingTrack[],
      buses: [bus('a', 'b'), bus('b', 'a')],
      sends: [] as Send[],
    },
    {
      name: 'send cycle',
      tracks: [] as RoutingTrack[],
      buses: [bus('master', null), bus('a', 'master')],
      sends: [{ id: 's', sourceBusId: 'master', targetBusId: 'a', gain: 1, preFader: false }] as Send[],
    },
    {
      name: 'dangling track output',
      tracks: [track('track', 'missing')],
      buses: [bus('master', null)],
      sends: [] as Send[],
    },
    {
      name: 'dangling send source',
      tracks: [] as RoutingTrack[],
      buses: [bus('master', null)],
      sends: [{ id: 's', sourceTrackId: 'missing', targetBusId: 'master', gain: 1, preFader: false }] as Send[],
    },
    {
      name: 'ambiguous send source',
      tracks: [track('track', 'master')],
      buses: [bus('master', null)],
      sends: [{ id: 's', sourceTrackId: 'track', sourceBusId: 'master', targetBusId: 'master', gain: 1, preFader: false }] as Send[],
    },
    {
      name: 'duplicate IDs',
      tracks: [] as RoutingTrack[],
      buses: [bus('master', null), bus('master', null)],
      sends: [] as Send[],
    },
  ])('rejects $name without mutating inputs', ({ tracks, buses, sends }) => {
    const snapshot = JSON.stringify({ tracks, buses, sends });
    expect(() => validateRoutingGraph(tracks, buses, sends)).toThrow();
    expect(JSON.stringify({ tracks, buses, sends })).toBe(snapshot);
  });

  it('migrates legacy tracks to one master bus without changing track identity', () => {
    const legacy = [{ id: 'a' }, { id: 'b' }];
    const routing = createDefaultRouting(legacy);
    expect(routing.buses).toEqual([expect.objectContaining({ id: 'master', outputBusId: null })]);
    expect(routing.tracks).toEqual([
      { id: 'a', outputBusId: 'master' },
      { id: 'b', outputBusId: 'master' },
    ]);
    expect(routing.sends).toEqual([]);
  });
});
