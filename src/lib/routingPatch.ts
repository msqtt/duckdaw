import { validateRoutingGraph, type Bus, type RoutingTrack, type Send } from './routingGraph';

export type RoutingPortKind = 'out' | 'pre' | 'post';

export interface RoutingSourcePort {
  ownerType: 'track' | 'bus';
  ownerId: string;
  port: RoutingPortKind;
}

export type RoutingConnectionPlan =
  | { kind: 'track-output'; trackId: string; targetBusId: string }
  | { kind: 'bus-output'; busId: string; targetBusId: string }
  | { kind: 'send'; send: Send };

function sameSend(left: Send, right: Omit<Send, 'id'>): boolean {
  return left.sourceTrackId === right.sourceTrackId
    && left.sourceBusId === right.sourceBusId
    && left.targetBusId === right.targetBusId
    && left.preFader === right.preFader;
}

export function planRoutingConnection(
  tracks: readonly RoutingTrack[],
  buses: readonly Bus[],
  sends: readonly Send[],
  source: RoutingSourcePort,
  targetBusId: string,
  sendId: string = crypto.randomUUID(),
): RoutingConnectionPlan {
  const target = buses.find(bus => bus.id === targetBusId);
  if (!target) throw new Error('Routing target bus does not exist');

  if (source.ownerType === 'track') {
    const track = tracks.find(candidate => candidate.id === source.ownerId);
    if (!track) throw new Error('Routing source track does not exist');
    if (source.port === 'out') {
      if (track.outputBusId === targetBusId) throw new Error('Track output is already connected to this bus');
      const candidateTracks = tracks.map(candidate => candidate.id === source.ownerId
        ? { ...candidate, outputBusId: targetBusId }
        : { ...candidate });
      validateRoutingGraph(candidateTracks, buses, sends);
      return { kind: 'track-output', trackId: source.ownerId, targetBusId };
    }
  } else {
    const bus = buses.find(candidate => candidate.id === source.ownerId);
    if (!bus) throw new Error('Routing source bus does not exist');
    if (bus.id === targetBusId) throw new Error('A bus cannot route to itself');
    if (source.port === 'out') {
      if (bus.outputBusId == null) throw new Error('The destination bus output cannot be reassigned');
      if (bus.outputBusId === targetBusId) throw new Error('Bus output is already connected to this bus');
      const candidateBuses = buses.map(candidate => candidate.id === source.ownerId
        ? { ...candidate, outputBusId: targetBusId }
        : { ...candidate });
      validateRoutingGraph(tracks, candidateBuses, sends);
      return { kind: 'bus-output', busId: source.ownerId, targetBusId };
    }
  }

  const sendData: Omit<Send, 'id'> = {
    ...(source.ownerType === 'track' ? { sourceTrackId: source.ownerId } : { sourceBusId: source.ownerId }),
    targetBusId,
    gain: 0.5,
    preFader: source.port === 'pre',
  };
  if (sends.some(send => sameSend(send, sendData))) throw new Error('A duplicate send already exists');
  const send = { ...sendData, id: sendId };
  validateRoutingGraph(tracks, buses, [...sends, send]);
  return { kind: 'send', send };
}
