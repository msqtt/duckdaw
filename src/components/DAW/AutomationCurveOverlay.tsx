import type { AutomationLane, AutomationPoint } from '../../lib/automation';
import { getAutomationLabel, getAutomationRange } from '../../lib/automation';
import { dawStore, useDAWStore } from '../../store/dawStore';

const HEIGHT = 96;
const PADDING = 8;

function pointY(value: number, min: number, max: number): number {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return PADDING + (1 - normalized) * (HEIGHT - PADDING * 2);
}

function curvePath(lane: AutomationLane, pixelsPerBeat: number, min: number, max: number): string {
  if (lane.points.length === 0) return '';
  const points = [...lane.points].sort((left, right) => left.beat - right.beat);
  let path = `M ${points[0].beat * pixelsPerBeat} ${pointY(points[0].value, min, max)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const x = point.beat * pixelsPerBeat;
    const y = pointY(point.value, min, max);
    if (previous.curve === 'step') path += ` H ${x} V ${y}`;
    else path += ` L ${x} ${y}`;
  }
  return path;
}

export function AutomationCurveOverlay({
  trackId,
  trackName,
  lane,
  pixelsPerBeat,
  snap,
  width,
}: {
  trackId: string;
  trackName: string;
  lane: AutomationLane;
  pixelsPerBeat: number;
  snap: number;
  width: number;
}) {
  const addAutomationPoint = useDAWStore(state => state.addAutomationPoint);
  const updateAutomationPoint = useDAWStore(state => state.updateAutomationPoint);
  const range = getAutomationRange(lane.target, lane);
  if (!range) return null;
  const label = getAutomationLabel(lane);
  const discrete = lane.valueType === 'discrete' || lane.target === 'track.mute' || lane.target === 'track.solo';

  const valueAtPointer = (clientY: number, rect: DOMRect) => {
    const normalized = Math.max(0, Math.min(1, 1 - ((clientY - rect.top - PADDING) / (rect.height - PADDING * 2))));
    const value = range.min + normalized * (range.max - range.min);
    return discrete ? Math.round(value) : value;
  };

  return (
    <div
      role="region"
      aria-label={`Automation curve for ${label} on ${trackName}`}
      data-testid="automation-curve"
      className="absolute inset-0 z-30 cursor-crosshair overflow-hidden bg-emerald-500/5"
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => {
        event.stopPropagation();
        if ((event.target as HTMLElement).closest('[data-automation-point]')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const beat = Math.max(0, Math.round(((event.clientX - rect.left) / pixelsPerBeat) / snap) * snap);
        if (lane.points.some(point => point.beat === beat)) return;
        addAutomationPoint(trackId, lane.id, {
          beat,
          value: valueAtPointer(event.clientY, rect),
          curve: discrete ? 'step' : 'linear',
        });
      }}
    >
      <div className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-neutral-950/75 px-1.5 py-0.5 text-[9px] text-emerald-300">
        {label}
      </div>
      <svg aria-hidden="true" className="absolute inset-0 h-full" style={{ width }}>
        <path d={curvePath(lane, pixelsPerBeat, range.min, range.max)} fill="none" stroke="rgb(16 185 129)" strokeWidth="2" />
      </svg>
      {lane.points.map(point => (
        <button
          key={point.id}
          type="button"
          data-automation-point
          aria-label={`Automation point ${label}, beat ${point.beat}, value ${point.value.toFixed(3)}`}
          className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow"
          style={{ left: point.beat * pixelsPerBeat, top: pointY(point.value, range.min, range.max) }}
          onDoubleClick={event => event.stopPropagation()}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const overlay = event.currentTarget.parentElement;
            if (!overlay) return;
            const rect = overlay.getBoundingClientRect();
            const original: AutomationPoint = { ...point };
            let final: AutomationPoint = { ...point };
            dawStore.temporal.getState().pause();

            const move = (moveEvent: PointerEvent) => {
              const beat = Math.max(0, Math.round(((moveEvent.clientX - rect.left) / pixelsPerBeat) / snap) * snap);
              const value = valueAtPointer(moveEvent.clientY, rect);
              const currentLane = dawStore.getState().tracks.find(track => track.id === trackId)
                ?.automationLanes.find(candidate => candidate.id === lane.id);
              if (!currentLane || currentLane.points.some(candidate => candidate.id !== point.id && candidate.beat === beat)) return;
              final = { ...point, beat, value, curve: discrete ? 'step' : point.curve };
              updateAutomationPoint(trackId, lane.id, point.id, { beat, value, curve: final.curve });
            };
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              updateAutomationPoint(trackId, lane.id, point.id, original);
              dawStore.temporal.getState().resume();
              if (final.beat !== original.beat || final.value !== original.value || final.curve !== original.curve) {
                updateAutomationPoint(trackId, lane.id, point.id, final);
              }
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        />
      ))}
    </div>
  );
}
