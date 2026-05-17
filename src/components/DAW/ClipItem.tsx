import React, { useState } from 'react';
import * as Tone from 'tone';
import { Trash2 } from 'lucide-react';
import { useDAWStore, Clip } from '../../store/dawStore';
import { AudioWaveform } from './AudioWaveform';
import { useShallow } from 'zustand/react/shallow';

export let currentDragContext: { id: string, duration: number, offsetX: number } | null = null;
export function setDragContext(val: any) { currentDragContext = val; }
export function handleClipDragEnd() { currentDragContext = null; }

function ClipItemComponent({ clip, trackColor, onContextMenu, onDeletePrompt }: { clip: Clip, trackColor: string, onContextMenu?: React.MouseEventHandler, key?: React.Key, onDeletePrompt?: (type: 'track'|'clip', id: string) => void }) {
  const { selectClip, selectedClipIds, updateClip, deleteClip, zoom, snapToGrid, snapGridSize } = useDAWStore(useShallow(state => ({
    selectClip: state.selectClip,
    selectedClipIds: state.selectedClipIds,
    updateClip: state.updateClip,
    deleteClip: state.deleteClip,
    zoom: state.zoom,
    snapToGrid: state.snapToGrid,
    snapGridSize: state.snapGridSize
  })));
  
  const isSelected = selectedClipIds.includes(clip.id);
  const PIXELS_PER_BEAT = zoom;
  const SNAP = snapToGrid ? snapGridSize : 0.015625; // fallback size for no grid
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(clip.name || 'Clip');

  // Simple Drag logic
  const handleDragStart = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    currentDragContext = { id: clip.id, duration: clip.duration, offsetX };
    e.dataTransfer.setData('text/plain', clip.id);
    e.dataTransfer.setData('offsetX', offsetX.toString());
    e.dataTransfer.setData('clipDuration', clip.duration.toString());
    e.dataTransfer.effectAllowed = 'copyMove';
    if (e.altKey) {
        e.dataTransfer.setData('action', 'copy');
    } else {
        e.dataTransfer.setData('action', 'move');
    }
    
    // Create a transparent drag image so we can draw our own
    const img = new window.Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  
  const handleDragEnd = () => {
    handleClipDragEnd();
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => {
          e.stopPropagation();
          useDAWStore.getState().setBottomPanel('piano-roll');
      }}
      className={`absolute h-20 top-2 rounded-md border-2 overflow-hidden cursor-grab active:cursor-grabbing ${isSelected ? 'border-white z-10 shadow-lg' : 'border-transparent shadow-sm'}`}
      style={{
        left: `${clip.start * PIXELS_PER_BEAT}px`,
        width: `${clip.duration * PIXELS_PER_BEAT}px`,
        backgroundColor: trackColor,
        opacity: isSelected ? 0.9 : 0.7
      }}
      onClick={(e) => { 
          e.stopPropagation(); 
          if(e.shiftKey) selectClip(clip.id, true);
          else selectClip(clip.id); 
      }}
    >
        <div className="px-2 py-1 text-xs font-bold text-black/60 truncate flex justify-between items-center group relative z-10">
            {isEditing ? (
                <input 
                    autoFocus
                    className="w-full bg-black/20 text-white outline-none rounded px-1"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={() => {
                        setIsEditing(false);
                        updateClip(clip.id, { name: nameInput.trim() || undefined });
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                />
            ) : (
                <span 
                    className="flex-1 truncate cursor-text"
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                    }}
                >
                    {clip.name || (clip.type === 'midi' ? 'MIDI Clip' : 'Audio Clip')}
                </span>
            )}
            {!isEditing && (
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if (onDeletePrompt) onDeletePrompt('clip', clip.id);
                        else deleteClip(clip.id); 
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity ml-1"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
        {/* Draw miniature notes if midi */}
        {clip.type === 'midi' && clip.notes && (
            <div className="absolute bottom-1 left-2 pl-0 right-2 top-5 flex pointer-events-none">
                {clip.notes.map(note => {
                    let midi = 60;
                    try { midi = Tone.Frequency(note.note).toMidi(); } catch(e) {}
                    const yPct = Math.max(0, Math.min(100, ((midi - 36) / 48) * 100));
                    return (
                        <div 
                            key={note.id}
                            className="absolute h-1 bg-black/60 dark:bg-white/60 rounded-full"
                            style={{
                                left: `${(note.start / clip.duration) * 100}%`,
                                width: `${Math.max(2, (note.duration / clip.duration) * 100)}%`,
                                bottom: `${yPct * 0.8}%`
                            }}
                        />
                    );
                })}
            </div>
        )}
        
        {clip.type === 'audio' && (
            <div className="absolute inset-x-0 bottom-2 top-6 flex items-center justify-start opacity-30 pointer-events-none overflow-hidden">
                 <div style={{ width: clip.originalDuration ? `${(clip.originalDuration / clip.duration) * 100}%` : '100%', height: '100%', left: 0, position: 'absolute' }}>
                     <AudioWaveform url={clip.bufferUrl} />
                 </div>
            </div>
        )}
        
        {/* Resize Handles */}
        {clip.type !== 'audio' && (
        <div 
            draggable
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const startX = e.clientX;
                const startBeat = clip.start;
                const startDur = clip.duration;
                
                const onMove = (moveEvent: PointerEvent) => {
                    const diffPx = moveEvent.clientX - startX;
                    const diffBeats = diffPx / PIXELS_PER_BEAT;
                    const snappedDiff = Math.round(diffBeats / SNAP) * SNAP;
                    
                    if (startDur - snappedDiff > 0) {
                       updateClip(clip.id, { start: startBeat + snappedDiff, duration: startDur - snappedDiff });
                    }
                };
                
                const onUp = (upEvent: PointerEvent) => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };
                
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            }}
        />
        )}
        <div 
            draggable
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const startX = e.clientX;
                const startDur = clip.duration;
                
                const onMove = (moveEvent: PointerEvent) => {
                    const diffPx = moveEvent.clientX - startX;
                    const diffBeats = diffPx / PIXELS_PER_BEAT;
                    let newDur = Math.max(SNAP, Math.round((startDur + diffBeats) / SNAP) * SNAP);
                    if (clip.type === 'audio' && clip.originalDuration) {
                        newDur = Math.min(newDur, clip.originalDuration);
                    }
                    updateClip(clip.id, { duration: newDur });
                };
                
                const onUp = (upEvent: PointerEvent) => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };
                
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            }}
        />
    </div>
  );
}

export const ClipItem = React.memo(ClipItemComponent);
