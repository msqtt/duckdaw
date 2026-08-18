export type EffectType = 'reverb' | 'delay' | 'limiter';

export interface EffectDescriptor {
  id: string;
  type: EffectType;
  enabled: boolean;
  parameters: Record<string, number>;
}

export interface Bus {
  id: string;
  name: string;
  volume: number;
  pan: number;
  isMuted: boolean;
  effects: EffectDescriptor[];
  outputBusId: string | null;
}

export interface Send {
  id: string;
  sourceTrackId?: string;
  sourceBusId?: string;
  targetBusId: string;
  gain: number;
  preFader: boolean;
}

export interface RoutingTrack {
  id: string;
  outputBusId: string;
}

export interface RoutingTrackInput {
  id: string;
  outputBusId?: string;
}

export interface ValidatedRoutingGraph {
  tracks: RoutingTrack[];
  buses: Bus[];
  sends: Send[];
  busOrder: string[];
}

function uniqueNonEmptyIds(values: readonly { id: string }[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value.id !== 'string' || value.id.length === 0 || ids.has(value.id)) {
      throw new Error(`${label} IDs must be non-empty and unique`);
    }
    ids.add(value.id);
  }
  return ids;
}

export function validateRoutingGraph(
  inputTracks: readonly RoutingTrackInput[],
  inputBuses: readonly Bus[],
  inputSends: readonly Send[],
): ValidatedRoutingGraph {
  const tracks: RoutingTrack[] = inputTracks.map(track => {
    if (typeof track.outputBusId !== 'string' || track.outputBusId.length === 0) {
      throw new Error(`Track ${track.id} has a dangling output bus`);
    }
    return { id: track.id, outputBusId: track.outputBusId };
  });
  const buses = inputBuses.map(bus => ({
    ...bus,
    effects: bus.effects.map(effect => ({ ...effect, parameters: { ...effect.parameters } })),
  }));
  const sends = inputSends.map(send => ({ ...send }));
  if (buses.length === 0 || buses.filter(bus => bus.outputBusId == null).length !== 1) {
    throw new Error('Routing graph must contain exactly one destination bus');
  }
  const trackIds = uniqueNonEmptyIds(tracks, 'Track');
  const busIds = uniqueNonEmptyIds(buses, 'Bus');
  uniqueNonEmptyIds(sends, 'Send');

  for (const track of tracks) {
    if (!busIds.has(track.outputBusId)) throw new Error(`Track ${track.id} has a dangling output bus`);
  }

  const adjacency = new Map(buses.map(bus => [bus.id, new Set<string>()]));
  for (const bus of buses) {
    if (typeof bus.name !== 'string' || bus.name.length === 0
      || !Number.isFinite(bus.volume) || bus.volume < 0 || bus.volume > 1
      || !Number.isFinite(bus.pan) || bus.pan < -1 || bus.pan > 1
      || typeof bus.isMuted !== 'boolean' || !Array.isArray(bus.effects)) {
      throw new Error(`Invalid bus ${bus.id}`);
    }
    if (bus.outputBusId != null) {
      if (!busIds.has(bus.outputBusId)) throw new Error(`Bus ${bus.id} has a dangling output bus`);
      adjacency.get(bus.id)!.add(bus.outputBusId);
    }
    uniqueNonEmptyIds(bus.effects, `Effect on ${bus.id}`);
    for (const effect of bus.effects) {
      if (!['reverb', 'delay', 'limiter'].includes(effect.type)
        || typeof effect.enabled !== 'boolean' || effect.parameters == null
        || Object.values(effect.parameters).some(value => !Number.isFinite(value))) {
        throw new Error(`Invalid effect on bus ${bus.id}`);
      }
    }
  }

  for (const send of sends) {
    const sourceCount = Number(send.sourceTrackId != null) + Number(send.sourceBusId != null);
    if (sourceCount !== 1) throw new Error(`Send ${send.id} must have exactly one source`);
    if (send.sourceTrackId != null && !trackIds.has(send.sourceTrackId)) throw new Error(`Send ${send.id} has a dangling track source`);
    if (send.sourceBusId != null && !busIds.has(send.sourceBusId)) throw new Error(`Send ${send.id} has a dangling bus source`);
    if (!busIds.has(send.targetBusId)) throw new Error(`Send ${send.id} has a dangling target bus`);
    if (!Number.isFinite(send.gain) || send.gain < 0 || send.gain > 1 || typeof send.preFader !== 'boolean') {
      throw new Error(`Invalid send ${send.id}`);
    }
    if (send.sourceBusId != null) adjacency.get(send.sourceBusId)!.add(send.targetBusId);
  }

  const indegree = new Map(buses.map(bus => [bus.id, 0]));
  for (const targets of adjacency.values()) {
    for (const target of targets) indegree.set(target, indegree.get(target)! + 1);
  }
  const queue = buses.filter(bus => indegree.get(bus.id) === 0).map(bus => bus.id);
  const busOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    busOrder.push(id);
    for (const target of adjacency.get(id)!) {
      const next = indegree.get(target)! - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  if (busOrder.length !== buses.length) throw new Error('Routing graph must be acyclic');

  return { tracks, buses, sends, busOrder };
}

export function createDefaultRouting(tracks: readonly { id: string }[]): {
  tracks: RoutingTrack[];
  buses: Bus[];
  sends: Send[];
} {
  const buses: Bus[] = [{
    id: 'master',
    name: 'Master',
    volume: 1,
    pan: 0,
    isMuted: false,
    effects: [],
    outputBusId: null,
  }];
  return {
    tracks: tracks.map(track => ({ id: track.id, outputBusId: 'master' })),
    buses,
    sends: [],
  };
}
