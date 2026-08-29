import React, { useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDAWStore } from '../../store/dawStore';
import { planRoutingConnection, type RoutingSourcePort } from '../../lib/routingPatch';

const NODE_WIDTH = 176;
const TRACK_X = 20;
const BUS_X = 340;
const DESTINATION_X = 650;
const ROW_HEIGHT = 88;

type PositionedNode = { id: string; x: number; y: number };

const curve = (fromX: number, fromY: number, toX: number, toY: number) => {
  const control = Math.max(50, Math.abs(toX - fromX) * 0.45);
  return `M ${fromX} ${fromY} C ${fromX + control} ${fromY}, ${toX - control} ${toY}, ${toX} ${toY}`;
};

export function RoutingGraph({
  expanded = false,
  zoom,
  onZoomChange,
}: {
  expanded?: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const { tracks, buses, sends, addBus, connectRoutingPort, deleteSend } = useDAWStore(useShallow(state => ({
    tracks: state.tracks,
    buses: state.buses,
    sends: state.sends,
    addBus: state.addBus,
    connectRoutingPort: state.connectRoutingPort,
    deleteSend: state.deleteSend,
  })));
  const [pending, setPending] = useState<RoutingSourcePort | null>(null);
  const [busName, setBusName] = useState('');
  const pendingRef = useRef<RoutingSourcePort | null>(null);
  const [message, setMessage] = useState('Choose OUT, PRE, or POST, then connect it to a Bus IN.');
  const rootBusId = buses.find(bus => bus.outputBusId == null)?.id;
  const routingTracks = tracks.map(track => ({ id: track.id, outputBusId: track.outputBusId ?? rootBusId ?? '' }));

  const positions = useMemo(() => {
    const trackNodes = new Map<string, PositionedNode>();
    tracks.forEach((track, index) => trackNodes.set(track.id, { id: track.id, x: TRACK_X, y: 18 + index * ROW_HEIGHT }));
    const busNodes = new Map<string, PositionedNode>();
    let busIndex = 0;
    for (const bus of buses) {
      if (bus.outputBusId == null) busNodes.set(bus.id, { id: bus.id, x: DESTINATION_X, y: 18 });
      else {
        busNodes.set(bus.id, { id: bus.id, x: BUS_X, y: 18 + busIndex * ROW_HEIGHT });
        busIndex += 1;
      }
    }
    return { trackNodes, busNodes };
  }, [buses, tracks]);

  const begin = (source: RoutingSourcePort) => {
    pendingRef.current = source;
    setPending(source);
    setMessage(`${source.ownerType} ${source.ownerId} ${source.port.toUpperCase()} selected; choose a Bus IN.`);
  };

  const complete = (targetBusId: string) => {
    const source = pendingRef.current;
    if (!source) return;
    pendingRef.current = null;
    setPending(null);
    try {
      planRoutingConnection(routingTracks, buses, sends, source, targetBusId, 'preview-send');
      connectRoutingPort(source, targetBusId);
      setMessage(`Connected ${source.port.toUpperCase()} to ${buses.find(bus => bus.id === targetBusId)?.name ?? targetBusId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Routing connection was rejected.');
    }
  };

  const sourcePort = (ownerType: 'track' | 'bus', ownerId: string, port: RoutingSourcePort['port'], label: string) => (
    <button
      type="button"
      aria-pressed={pending?.ownerType === ownerType && pending.ownerId === ownerId && pending.port === port}
      aria-label={`${label} ${port.toUpperCase()} routing port`}
      data-routing-port={`${ownerType}:${ownerId}:${port}`}
      onPointerDown={() => begin({ ownerType, ownerId, port })}
      onClick={() => begin({ ownerType, ownerId, port })}
      className={`rounded border px-1 py-0.5 font-mono text-[8px] ${pending?.ownerType === ownerType && pending.ownerId === ownerId && pending.port === port
        ? 'border-amber-400 bg-amber-400 text-black'
        : port === 'out' ? 'border-emerald-500 text-emerald-500' : 'border-sky-500 text-sky-500'}`}
    >{port.toUpperCase()}</button>
  );

  const height = Math.max(150, 42 + Math.max(tracks.length, buses.filter(bus => bus.outputBusId != null).length) * ROW_HEIGHT);
  const busInputPoint = (busId: string) => {
    const position = positions.busNodes.get(busId)!;
    return { x: position.x, y: position.y + 35 };
  };
  const sourcePoint = (ownerType: 'track' | 'bus', ownerId: string, port: RoutingSourcePort['port']) => {
    const position = ownerType === 'track' ? positions.trackNodes.get(ownerId)! : positions.busNodes.get(ownerId)!;
    return { x: position.x + NODE_WIDTH, y: position.y + (port === 'out' ? 20 : port === 'pre' ? 38 : 56) };
  };

  return (
    <section
      id="mixer-routing-workspace"
      data-expanded={expanded ? 'true' : 'false'}
      className={`${expanded ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0'} border-b border-neutral-300 bg-neutral-100 p-2 text-[10px] dark:border-neutral-800 dark:bg-neutral-900`}
      aria-label="Visual mixer routing"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <strong>ROUTING PATCH</strong>
        <div className="flex items-center gap-0.5" aria-label="Routing zoom controls">
          <button type="button" aria-label="Zoom out routing" onClick={() => onZoomChange(zoom - 0.1)} className="h-6 rounded border px-1">−</button>
          <span className="w-9 text-center font-mono text-[9px]">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in routing" onClick={() => onZoomChange(zoom + 0.1)} className="h-6 rounded border px-1">+</button>
        </div>
        <form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); if (!busName.trim()) return; addBus(busName); setBusName(''); }}>
          <label className="sr-only" htmlFor="routing-new-bus">New bus name</label>
          <input id="routing-new-bus" value={busName} onChange={event => setBusName(event.target.value)} placeholder="Group / Mix bus" className="h-6 w-28 rounded border border-neutral-300 bg-white px-1 dark:border-neutral-700 dark:bg-neutral-800" />
          <button type="submit" disabled={!busName.trim()} className="h-6 rounded bg-violet-600 px-2 text-white disabled:opacity-40">Add Bus</button>
        </form>
        <span role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-right text-[9px] text-neutral-500">{message}</span>
      </div>
      <div className={`${expanded ? 'min-h-0 flex-1' : 'max-h-56'} overflow-auto rounded border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950`}>
        <div className="relative" style={{ width: 850 * zoom, height: height * zoom }} data-testid="routing-canvas">
          <svg viewBox={`0 0 850 ${height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {tracks.flatMap(track => {
              const targetId = track.outputBusId ?? rootBusId;
              if (!targetId || !positions.busNodes.has(targetId)) return [];
              const from = sourcePoint('track', track.id, 'out');
              const to = busInputPoint(targetId);
              return <path key={`output-track-${track.id}`} data-routing-edge={`output:track:${track.id}:${targetId}`} d={curve(from.x, from.y, to.x, to.y)} fill="none" stroke="#10b981" strokeWidth="2" />;
            })}
            {buses.flatMap(bus => {
              if (bus.outputBusId == null || !positions.busNodes.has(bus.outputBusId)) return [];
              const from = sourcePoint('bus', bus.id, 'out');
              const to = busInputPoint(bus.outputBusId);
              return <path key={`output-bus-${bus.id}`} data-routing-edge={`output:bus:${bus.id}:${bus.outputBusId}`} d={curve(from.x, from.y, to.x, to.y)} fill="none" stroke="#10b981" strokeWidth="2" />;
            })}
            {sends.flatMap(send => {
              const ownerType = send.sourceTrackId ? 'track' as const : 'bus' as const;
              const ownerId = send.sourceTrackId ?? send.sourceBusId;
              if (!ownerId || !positions.busNodes.has(send.targetBusId)) return [];
              const from = sourcePoint(ownerType, ownerId, send.preFader ? 'pre' : 'post');
              const to = busInputPoint(send.targetBusId);
              return <path key={send.id} data-routing-edge={`send:${send.id}:${send.preFader ? 'pre' : 'post'}:${send.targetBusId}`} d={curve(from.x, from.y, to.x, to.y)} fill="none" stroke="#38bdf8" strokeDasharray={send.preFader ? '3 3' : '8 4'} strokeWidth="1.5" />;
            })}
          </svg>
          <div className="absolute left-0 top-0" style={{ width: 850, height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          {tracks.map(track => {
            const position = positions.trackNodes.get(track.id)!;
            return (
              <div key={track.id} className="absolute rounded border border-neutral-300 bg-white p-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-900" style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: 70 }}>
                <div className="truncate font-semibold" title={track.name}>{track.name}</div>
                <div className="text-[8px] uppercase text-neutral-500">Track · {track.type}</div>
                <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                  {sourcePort('track', track.id, 'out', track.name)}
                  {sourcePort('track', track.id, 'pre', track.name)}
                  {sourcePort('track', track.id, 'post', track.name)}
                </div>
              </div>
            );
          })}

          {buses.map(bus => {
            const position = positions.busNodes.get(bus.id)!;
            const isDestination = bus.outputBusId == null;
            return (
              <div key={bus.id} className={`absolute rounded border bg-white p-2 shadow-sm dark:bg-neutral-900 ${isDestination ? 'border-red-500/70' : 'border-violet-500/70'}`} style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: 70 }}>
                <button
                  type="button"
                  aria-label={`${bus.name} IN routing port`}
                  data-routing-port={`bus:${bus.id}:in`}
                  onPointerUp={() => complete(bus.id)}
                  onClick={() => complete(bus.id)}
                  className="absolute -left-2 top-6 rounded border border-violet-500 bg-neutral-100 px-1 py-0.5 font-mono text-[8px] text-violet-600 dark:bg-neutral-950"
                >IN</button>
                <div className="truncate font-semibold" title={bus.name}>{bus.name}</div>
                <div className="text-[8px] uppercase text-neutral-500">{isDestination ? 'Destination' : 'Bus / Group'}</div>
                {!isDestination && <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                  {sourcePort('bus', bus.id, 'out', bus.name)}
                  {sourcePort('bus', bus.id, 'pre', bus.name)}
                  {sourcePort('bus', bus.id, 'post', bus.name)}
                </div>}
              </div>
            );
          })}
          </div>
        </div>
      </div>
      {sends.length > 0 && <div className="mt-1 flex flex-wrap gap-1" aria-label="Active visual routing sends">
        {sends.map(send => {
          const sourceName = send.sourceTrackId
            ? tracks.find(track => track.id === send.sourceTrackId)?.name
            : buses.find(bus => bus.id === send.sourceBusId)?.name;
          const targetName = buses.find(bus => bus.id === send.targetBusId)?.name;
          return <button key={send.id} type="button" onClick={() => deleteSend(send.id)} aria-label={`Delete ${send.preFader ? 'pre' : 'post'} send ${sourceName} to ${targetName}`} className="rounded bg-sky-500/10 px-1 text-sky-600 hover:bg-red-500/10 hover:text-red-500">
            {sourceName} {send.preFader ? 'PRE' : 'POST'} → {targetName} ×
          </button>;
        })}
      </div>}
    </section>
  );
}
