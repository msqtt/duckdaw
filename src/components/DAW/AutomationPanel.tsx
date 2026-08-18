import React, { useState, useCallback } from 'react';
import { useDAWStore } from '../../store/dawStore';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Trash2, Power, X } from 'lucide-react';
import type { AutomationTarget, AutomationCurve } from '../../lib/automation';
import { AUTOMATION_RANGES } from '../../lib/automation';

const TARGET_LABELS: Record<AutomationTarget, string> = {
  volume: 'Volume',
  pan: 'Pan',
  reverb: 'Reverb',
  delay: 'Delay',
  masterVolume: 'Master Vol',
};

/**
 * AutomationPanel: Displays automation lanes for the selected track.
 * Provides controls for adding/deleting lanes, toggling enabled state,
 * and adding/editing/deleting automation points.
 */
export function AutomationPanel({ onClose }: { onClose: () => void }) {
  const { selectedTrackId, tracks, addAutomationLane, deleteAutomationLane, toggleAutomationLane, addAutomationPoint, updateAutomationPoint, deleteAutomationPoint } = useDAWStore(useShallow(state => ({
    selectedTrackId: state.selectedTrackId,
    tracks: state.tracks,
    addAutomationLane: state.addAutomationLane,
    deleteAutomationLane: state.deleteAutomationLane,
    toggleAutomationLane: state.toggleAutomationLane,
    addAutomationPoint: state.addAutomationPoint,
    updateAutomationPoint: state.updateAutomationPoint,
    deleteAutomationPoint: state.deleteAutomationPoint,
  })));

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const [addTarget, setAddTarget] = useState<AutomationTarget>('volume');
  const [editingPoint, setEditingPoint] = useState<{ laneId: string; pointId: string } | null>(null);
  const [editBeat, setEditBeat] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCurve, setEditCurve] = useState<AutomationCurve>('step');

  // Add point form state
  const [newPointLaneId, setNewPointLaneId] = useState<string | null>(null);
  const [newBeat, setNewBeat] = useState('0');
  const [newValue, setNewValue] = useState('0.5');
  const [newCurve, setNewCurve] = useState<AutomationCurve>('step');

  const handleAddLane = useCallback(() => {
    if (!selectedTrackId) return;
    addAutomationLane(selectedTrackId, addTarget);
  }, [selectedTrackId, addTarget, addAutomationLane]);

  const handleAddPoint = useCallback((laneId: string, target: AutomationTarget) => {
    if (!selectedTrackId) return;
    const beat = parseFloat(newBeat);
    const value = parseFloat(newValue);
    const range = AUTOMATION_RANGES[target];
    if (!Number.isFinite(beat) || beat < 0 || !Number.isFinite(value) || value < range.min || value > range.max) return;
    addAutomationPoint(selectedTrackId, laneId, { beat, value, curve: newCurve });
    setNewPointLaneId(null);
  }, [selectedTrackId, newBeat, newValue, newCurve, addAutomationPoint]);

  const handleStartEditPoint = useCallback((laneId: string, pointId: string, beat: number, value: number, curve: AutomationCurve) => {
    setEditingPoint({ laneId, pointId });
    setEditBeat(beat.toString());
    setEditValue(value.toString());
    setEditCurve(curve);
  }, []);

  const handleSaveEdit = useCallback((target: AutomationTarget) => {
    if (!editingPoint || !selectedTrackId) return;
    const beat = parseFloat(editBeat);
    const value = parseFloat(editValue);
    const range = AUTOMATION_RANGES[target];
    if (!Number.isFinite(beat) || beat < 0 || !Number.isFinite(value) || value < range.min || value > range.max) return;
    updateAutomationPoint(selectedTrackId, editingPoint.laneId, editingPoint.pointId, { beat, value, curve: editCurve });
    setEditingPoint(null);
  }, [editingPoint, selectedTrackId, editBeat, editValue, editCurve, updateAutomationPoint]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, target: AutomationTarget) => {
    if (e.key === 'Enter') handleSaveEdit(target);
    else if (e.key === 'Escape') { setEditingPoint(null); setNewPointLaneId(null); }
  }, [handleSaveEdit]);

  if (!selectedTrack) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-400" role="region" aria-label="Automation Panel">
        <div className="flex justify-between items-center mb-2">
          <span>Select a track to edit automation</span>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close automation panel"><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 max-h-96 overflow-y-auto" role="region" aria-label={`Automation for ${selectedTrack.name}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">⚡ Automation: {selectedTrack.name}</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close automation panel"><X size={14} /></button>
      </div>

      {/* Add lane controls */}
      <div className="flex items-center gap-1 mb-2">
        <select
          value={addTarget}
          onChange={e => setAddTarget(e.target.value as AutomationTarget)}
          className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs"
          aria-label="Target parameter"
        >
          {(Object.keys(TARGET_LABELS) as AutomationTarget[]).map(t => (
            <option key={t} value={t}>{TARGET_LABELS[t]}</option>
          ))}
        </select>
        <button onClick={handleAddLane} className="flex items-center gap-0.5 px-2 py-0.5 bg-green-700 hover:bg-green-600 rounded text-white" aria-label="Add automation lane">
          <Plus size={11} /> Lane
        </button>
      </div>

      {/* Lane list */}
      {selectedTrack.automationLanes.length === 0 && (
        <p className="text-gray-500 italic">No automation lanes. Add one above.</p>
      )}

      {selectedTrack.automationLanes.map(lane => (
        <div key={lane.id} className="border border-gray-700 rounded mb-2 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{TARGET_LABELS[lane.target] || lane.target}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleAutomationLane(selectedTrackId!, lane.id)}
                className={`p-0.5 rounded ${lane.enabled ? 'text-green-400' : 'text-gray-500'}`}
                aria-label={`${lane.enabled ? 'Disable' : 'Enable'} ${TARGET_LABELS[lane.target]} automation`}
                aria-pressed={lane.enabled}
              >
                <Power size={12} />
              </button>
              <button
                onClick={() => deleteAutomationLane(selectedTrackId!, lane.id)}
                className="p-0.5 hover:bg-red-900 rounded text-red-400"
                aria-label={`Delete ${TARGET_LABELS[lane.target]} lane`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>

          {/* Points */}
          <table className="w-full text-left" role="grid" aria-label={`${TARGET_LABELS[lane.target]} automation points`}>
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="py-0.5 px-1">Beat</th>
                <th className="py-0.5 px-1">Value</th>
                <th className="py-0.5 px-1">Curve</th>
                <th className="py-0.5 px-1 text-right">
                  <button
                    onClick={() => setNewPointLaneId(lane.id)}
                    className="text-green-400 hover:text-green-300"
                    aria-label="Add automation point"
                  >
                    <Plus size={11} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {lane.points.map(point => (
                <tr key={point.id} className="border-b border-gray-800">
                  {editingPoint?.pointId === point.id ? (
                    <>
                      <td className="py-0.5 px-1">
                        <input type="number" value={editBeat} onChange={e => setEditBeat(e.target.value)} onKeyDown={e => handleKeyDown(e, lane.target)} className="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-xs" min={0} step={0.25} aria-label="Beat" autoFocus />
                      </td>
                      <td className="py-0.5 px-1">
                        <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => handleKeyDown(e, lane.target)} className="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-xs" step={0.01} aria-label="Value" />
                      </td>
                      <td className="py-0.5 px-1">
                        <select value={editCurve} onChange={e => setEditCurve(e.target.value as AutomationCurve)} onKeyDown={e => handleKeyDown(e, lane.target)} className="bg-gray-800 border border-gray-600 rounded text-xs" aria-label="Curve">
                          <option value="step">Step</option>
                          <option value="linear">Linear</option>
                          <option value="exponential">Exp</option>
                        </select>
                      </td>
                      <td className="py-0.5 px-1 text-right">
                        <button onClick={() => handleSaveEdit(lane.target)} className="text-green-400 px-1" aria-label="Save point">✓</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-0.5 px-1 cursor-pointer" tabIndex={0} onClick={() => handleStartEditPoint(lane.id, point.id, point.beat, point.value, point.curve)} onKeyDown={e => e.key === 'Enter' && handleStartEditPoint(lane.id, point.id, point.beat, point.value, point.curve)} role="button" aria-label={`Edit point at beat ${point.beat}`}>{point.beat}</td>
                      <td className="py-0.5 px-1">{point.value.toFixed(2)}</td>
                      <td className="py-0.5 px-1">{point.curve}</td>
                      <td className="py-0.5 px-1 text-right">
                        <button onClick={() => deleteAutomationPoint(selectedTrackId!, lane.id, point.id)} className="p-0.5 hover:bg-red-900 rounded text-red-400" aria-label={`Delete point at beat ${point.beat}`}>
                          <Trash2 size={10} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {newPointLaneId === lane.id && (
                <tr className="border-b border-gray-800 bg-gray-850">
                  <td className="py-0.5 px-1">
                    <input type="number" value={newBeat} onChange={e => setNewBeat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddPoint(lane.id, lane.target); else if (e.key === 'Escape') setNewPointLaneId(null); }} className="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-xs" min={0} step={0.25} aria-label="New beat" autoFocus />
                  </td>
                  <td className="py-0.5 px-1">
                    <input type="number" value={newValue} onChange={e => setNewValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddPoint(lane.id, lane.target); else if (e.key === 'Escape') setNewPointLaneId(null); }} className="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-xs" step={0.01} aria-label="New value" />
                  </td>
                  <td className="py-0.5 px-1">
                    <select value={newCurve} onChange={e => setNewCurve(e.target.value as AutomationCurve)} className="bg-gray-800 border border-gray-600 rounded text-xs" aria-label="New curve">
                      <option value="step">Step</option>
                      <option value="linear">Linear</option>
                      <option value="exponential">Exp</option>
                    </select>
                  </td>
                  <td className="py-0.5 px-1 text-right">
                    <button onClick={() => handleAddPoint(lane.id, lane.target)} className="text-green-400 px-1" aria-label="Confirm add point">✓</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {lane.points.length === 0 && newPointLaneId !== lane.id && (
            <p className="text-gray-500 italic text-center py-1">No points. Click + to add.</p>
          )}
        </div>
      ))}
    </div>
  );
}
