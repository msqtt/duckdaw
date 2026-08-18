import React, { useState, useCallback } from 'react';
import { useDAWStore } from '../../store/dawStore';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Trash2, X } from 'lucide-react';
import type { TempoPoint } from '../../lib/tempoMap';

/**
 * TempoMapEditor: Inline editor for the global tempo map.
 * Provides keyboard-operable controls for adding, editing, and deleting tempo points.
 */
export function TempoMapEditor({ onClose }: { onClose: () => void }) {
  const { tempoTrack, setTempoPoints } = useDAWStore(useShallow(state => ({
    tempoTrack: state.tempoTrack,
    setTempoPoints: state.setTempoPoints,
  })));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBeat, setEditBeat] = useState('');
  const [editBpm, setEditBpm] = useState('');
  const [editCurve, setEditCurve] = useState<'step' | 'linear'>('step');

  const handleAddPoint = useCallback(() => {
    const lastPoint = tempoTrack[tempoTrack.length - 1];
    const newBeat = lastPoint ? lastPoint.beat + 4 : 0;
    const newPoint: TempoPoint = {
      id: `tempo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      beat: newBeat,
      bpm: lastPoint?.bpm ?? 120,
      curve: 'step',
    };
    setTempoPoints([...tempoTrack, newPoint]);
  }, [tempoTrack, setTempoPoints]);

  const handleDeletePoint = useCallback((id: string) => {
    if (tempoTrack.length <= 1) return; // Must keep at least one point
    const filtered = tempoTrack.filter(p => p.id !== id);
    // Ensure beat 0 exists
    if (filtered.length > 0 && filtered[0].beat !== 0) {
      filtered[0] = { ...filtered[0], beat: 0 };
    }
    setTempoPoints(filtered);
  }, [tempoTrack, setTempoPoints]);

  const handleStartEdit = useCallback((point: TempoPoint) => {
    setEditingId(point.id);
    setEditBeat(point.beat.toString());
    setEditBpm(point.bpm.toString());
    setEditCurve(point.curve);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const beat = parseFloat(editBeat);
    const bpm = parseFloat(editBpm);
    if (!Number.isFinite(beat) || beat < 0 || !Number.isFinite(bpm) || bpm < 20 || bpm > 300) return;

    const updated = tempoTrack.map(p => p.id === editingId
      ? { ...p, beat, bpm, curve: editCurve }
      : p
    ).sort((a, b) => a.beat - b.beat);

    // Ensure first is at beat 0
    if (updated.length > 0 && updated[0].beat !== 0) {
      updated[0] = { ...updated[0], beat: 0 };
    }
    setTempoPoints(updated);
    setEditingId(null);
  }, [editingId, editBeat, editBpm, editCurve, tempoTrack, setTempoPoints]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  }, [handleSaveEdit]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-200" role="region" aria-label="Tempo Map Editor">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">🎵 Tempo Map</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close tempo editor">
          <X size={14} />
        </button>
      </div>
      <table className="w-full text-left" role="grid">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="py-1 px-1">Beat</th>
            <th className="py-1 px-1">BPM</th>
            <th className="py-1 px-1">Curve</th>
            <th className="py-1 px-1 text-right">
              <button onClick={handleAddPoint} className="p-1 hover:bg-gray-700 rounded text-green-400" aria-label="Add tempo point">
                <Plus size={12} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {tempoTrack.map((point, index) => (
            <tr key={point.id} className="border-b border-gray-800 hover:bg-gray-800">
              {editingId === point.id ? (
                <>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      value={editBeat}
                      onChange={e => setEditBeat(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs"
                      min={0}
                      step={1}
                      disabled={index === 0}
                      aria-label="Beat position"
                      autoFocus
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      value={editBpm}
                      onChange={e => setEditBpm(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs"
                      min={20}
                      max={300}
                      step={1}
                      aria-label="BPM"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <select
                      value={editCurve}
                      onChange={e => setEditCurve(e.target.value as 'step' | 'linear')}
                      onKeyDown={handleKeyDown}
                      className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs"
                      aria-label="Curve type"
                    >
                      <option value="step">Step</option>
                      <option value="linear">Linear</option>
                    </select>
                  </td>
                  <td className="py-1 px-1 text-right">
                    <button onClick={handleSaveEdit} className="text-green-400 hover:text-green-300 px-1" aria-label="Save">✓</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-1 px-1 cursor-pointer" onClick={() => handleStartEdit(point)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && handleStartEdit(point)} role="button" aria-label={`Edit beat ${point.beat}`}>{point.beat}</td>
                  <td className="py-1 px-1 cursor-pointer" onClick={() => handleStartEdit(point)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && handleStartEdit(point)} role="button" aria-label={`Edit BPM ${point.bpm}`}>{point.bpm}</td>
                  <td className="py-1 px-1">{point.curve}</td>
                  <td className="py-1 px-1 text-right">
                    {tempoTrack.length > 1 && (
                      <button
                        onClick={() => handleDeletePoint(point.id)}
                        className="p-0.5 hover:bg-red-900 rounded text-red-400"
                        aria-label={`Delete tempo point at beat ${point.beat}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
