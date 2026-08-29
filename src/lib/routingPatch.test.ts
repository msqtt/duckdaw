import { describe, expect, it } from 'vitest';
import { planRoutingConnection, type RoutingSourcePort } from './routingPatch';
import type { Bus, Send } from './routingGraph';

const buses: Bus[] = [
  { id: 'master', name: 'Master', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: null },
  { id: 'group', name: 'Group', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: 'master' },
  { id: 'parallel', name: 'Parallel', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: 'master' },
];
const tracks = [{ id: 'track', outputBusId: 'master' }];

const source = (ownerType: 'track' | 'bus', ownerId: string, port: 'out' | 'pre' | 'post'): RoutingSourcePort => ({
  ownerType, ownerId, port,
});

describe('MIX-ROUTE-03 routing patch domain', () => {
  it('maps OUT and PRE/POST ports to output and send graph edits', () => {
    expect(planRoutingConnection(tracks, buses, [], source('track', 'track', 'out'), 'group'))
      .toEqual({ kind: 'track-output', trackId: 'track', targetBusId: 'group' });
    expect(planRoutingConnection(tracks, buses, [], source('bus', 'group', 'out'), 'parallel'))
      .toEqual({ kind: 'bus-output', busId: 'group', targetBusId: 'parallel' });
    expect(planRoutingConnection(tracks, buses, [], source('track', 'track', 'pre'), 'group', 'send-1'))
      .toEqual({
        kind: 'send',
        send: { id: 'send-1', sourceTrackId: 'track', targetBusId: 'group', gain: 0.5, preFader: true },
      });
    expect(planRoutingConnection(tracks, buses, [], source('bus', 'group', 'post'), 'master', 'send-2'))
      .toEqual({
        kind: 'send',
        send: { id: 'send-2', sourceBusId: 'group', targetBusId: 'master', gain: 0.5, preFader: false },
      });
  });

  it('rejects duplicate sends, no-op outputs, self targets, dangling ports and cycles without mutating inputs', () => {
    const sends: Send[] = [{ id: 'existing', sourceTrackId: 'track', targetBusId: 'group', gain: 0.5, preFader: true }];
    const snapshot = structuredClone({ tracks, buses, sends });

    expect(() => planRoutingConnection(tracks, buses, sends, source('track', 'track', 'pre'), 'group'))
      .toThrow(/duplicate/i);
    expect(() => planRoutingConnection(tracks, buses, sends, source('track', 'track', 'out'), 'master'))
      .toThrow(/already/i);
    expect(() => planRoutingConnection(tracks, buses, sends, source('bus', 'group', 'out'), 'group'))
      .toThrow(/itself/i);
    expect(() => planRoutingConnection(tracks, buses, sends, source('track', 'missing', 'out'), 'group'))
      .toThrow(/source/i);
    expect(() => planRoutingConnection(tracks, buses, sends, source('bus', 'master', 'out'), 'group'))
      .toThrow(/destination/i);
    expect({ tracks, buses, sends }).toEqual(snapshot);
  });
});
