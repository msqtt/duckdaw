import { Zap } from 'lucide-react';
import { useDAWStore } from '../../store/dawStore';
import { automationUiStore } from '../../store/automationUiStore';
import type { AutomationBinding } from '../../lib/automation';

export function AutomationCreateButton({
  trackId,
  trackName,
  binding,
  currentValue,
  className = '',
}: {
  trackId: string;
  trackName: string;
  binding: AutomationBinding;
  currentValue: number;
  className?: string;
}) {
  const laneId = useDAWStore(state => state.tracks
    .find(track => track.id === trackId)?.automationLanes
    .find(lane => lane.target === binding.target)?.id);
  const ensureAutomationLane = useDAWStore(state => state.ensureAutomationLane);
  const action = laneId == null ? 'Create' : 'Show';
  const label = `${action} automation for ${binding.label} on ${trackName}`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        const ensuredId = ensureAutomationLane(trackId, binding, currentValue);
        if (ensuredId) automationUiStore.getState().activate(trackId, ensuredId);
      }}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-emerald-500/15 hover:text-emerald-500 ${laneId ? 'text-emerald-500' : ''} ${className}`}
    >
      <Zap size={11} aria-hidden="true" />
    </button>
  );
}
