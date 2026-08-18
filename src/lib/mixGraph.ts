import {
  validateRoutingGraph,
  type Bus,
  type EffectDescriptor,
  type RoutingTrack,
  type Send,
} from './routingGraph';

export interface MixGraphNode {
  id: string;
  kind: 'track' | 'bus' | 'destination';
  volume?: number;
  pan?: number;
  muted?: boolean;
  effects?: EffectDescriptor[];
}

export interface MixGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'output' | 'send-pre' | 'send-post';
  gain: number;
}

export interface MixGraphPlan {
  nodes: MixGraphNode[];
  edges: MixGraphEdge[];
  busOrder: string[];
}

export function buildMixGraphPlan(
  tracks: readonly RoutingTrack[],
  buses: readonly Bus[],
  sends: readonly Send[],
): MixGraphPlan {
  const graph = validateRoutingGraph(tracks, buses, sends);
  const busById = new Map(graph.buses.map(bus => [bus.id, bus]));
  const sendsByTrack = new Map<string, Send[]>();
  const sendsByBus = new Map<string, Send[]>();
  for (const send of graph.sends) {
    const map = send.sourceTrackId != null ? sendsByTrack : sendsByBus;
    const id = send.sourceTrackId ?? send.sourceBusId!;
    map.set(id, [...(map.get(id) ?? []), send]);
  }

  const nodes: MixGraphNode[] = [
    ...graph.tracks.map(track => ({ id: `track:${track.id}`, kind: 'track' as const })),
    ...graph.busOrder.map(id => {
      const bus = busById.get(id)!;
      return {
        id: `bus:${id}`,
        kind: 'bus' as const,
        volume: bus.volume,
        pan: bus.pan,
        muted: bus.isMuted,
        effects: bus.effects.map(effect => ({ ...effect, parameters: { ...effect.parameters } })),
      };
    }),
    { id: 'destination', kind: 'destination' as const },
  ];

  const edges: MixGraphEdge[] = [];
  for (const track of graph.tracks) {
    edges.push({
      id: `output:${track.id}`,
      from: `track:${track.id}:post`,
      to: `bus:${track.outputBusId}:input`,
      kind: 'output',
      gain: 1,
    });
    for (const send of sendsByTrack.get(track.id) ?? []) {
      edges.push({
        id: `send:${send.id}`,
        from: `track:${track.id}:${send.preFader ? 'pre' : 'post'}`,
        to: `bus:${send.targetBusId}:input`,
        kind: send.preFader ? 'send-pre' : 'send-post',
        gain: send.gain,
      });
    }
  }
  for (const busId of graph.busOrder) {
    const bus = busById.get(busId)!;
    edges.push({
      id: `output:${busId}`,
      from: `bus:${busId}:post`,
      to: bus.outputBusId == null ? 'destination' : `bus:${bus.outputBusId}:input`,
      kind: 'output',
      gain: 1,
    });
    for (const send of sendsByBus.get(busId) ?? []) {
      edges.push({
        id: `send:${send.id}`,
        from: `bus:${busId}:${send.preFader ? 'pre' : 'post'}`,
        to: `bus:${send.targetBusId}:input`,
        kind: send.preFader ? 'send-pre' : 'send-post',
        gain: send.gain,
      });
    }
  }

  return { nodes, edges, busOrder: [...graph.busOrder] };
}
