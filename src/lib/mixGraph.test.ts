import { describe, expect, it } from 'vitest';
import { buildMixGraphPlan } from './mixGraph';
import type { Bus, RoutingTrack, Send } from './routingGraph';

const buses: Bus[] = [
  { id: 'master', name: 'Master', volume: 1, pan: 0, isMuted: false, effects: [], outputBusId: null },
  { id: 'group', name: 'Group', volume: 0.8, pan: -0.2, isMuted: false, effects: [], outputBusId: 'master' },
  { id: 'fx', name: 'FX', volume: 1, pan: 0, isMuted: false, effects: [{ id: 'verb', type: 'reverb', enabled: true, parameters: { decay: 2 } }], outputBusId: 'master' },
];
const tracks: RoutingTrack[] = [{ id: 'track', outputBusId: 'group' }];
const sends: Send[] = [
  { id: 'pre', sourceTrackId: 'track', targetBusId: 'fx', gain: 0.25, preFader: true },
  { id: 'post', sourceBusId: 'group', targetBusId: 'fx', gain: 0.5, preFader: false },
];

describe('shared mix graph plan', () => {
  it('builds deterministic nodes and ordered output/send edges', () => {
    const plan = buildMixGraphPlan(tracks, buses, sends);
    expect(plan.nodes.map(node => node.id)).toEqual(['track:track', 'bus:group', 'bus:fx', 'bus:master', 'destination']);
    expect(plan.edges).toEqual([
      { id: 'output:track', from: 'track:track:post', to: 'bus:group:input', kind: 'output', gain: 1 },
      { id: 'send:pre', from: 'track:track:pre', to: 'bus:fx:input', kind: 'send-pre', gain: 0.25 },
      { id: 'output:group', from: 'bus:group:post', to: 'bus:master:input', kind: 'output', gain: 1 },
      { id: 'send:post', from: 'bus:group:post', to: 'bus:fx:input', kind: 'send-post', gain: 0.5 },
      { id: 'output:fx', from: 'bus:fx:post', to: 'bus:master:input', kind: 'output', gain: 1 },
      { id: 'output:master', from: 'bus:master:post', to: 'destination', kind: 'output', gain: 1 },
    ]);
  });

  it('returns independent data so realtime and offline consumers cannot mutate each other', () => {
    const realtime = buildMixGraphPlan(tracks, buses, sends);
    const offline = buildMixGraphPlan(tracks, buses, sends);
    realtime.edges[0].gain = 0;
    expect(offline.edges[0].gain).toBe(1);
    expect(buses[0].volume).toBe(1);
  });
});
