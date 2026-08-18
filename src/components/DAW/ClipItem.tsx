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
  const { selectClip, selectedClipIds, updateClip, trimClipStart, trimClipEnd, deleteClip, zoom, bpm, snapToGrid, snapGridSize, switchTake } = useDAWStore(useShallow(state => ({
    selectClip: state.selectClip,
    selectedClipIds: state.selectedClipIds,
    updateClip: state.updateClip,
    trimClipStart: state.trimClipStart,
    trimClipEnd: state.trimClipEnd,
    deleteClip: state.deleteClip,
    zoom: state.zoom,
    bpm: state.bpm,
    snapToGrid: state.snapToGrid,
    snapGridSize: state.snapGridSize,
    switchTake: state.switchTake,
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
      data-testid="clip-item"
      data-clip-type={clip.type}
      data-reversed={clip.type === 'audio' ? String(Boolean(clip.audioEdit?.reversed)) : undefined}
      data-gain-db={clip.type === 'audio' ? String(clip.audioEdit?.gainDb ?? 0) : undefined}
      draggable={!isEditing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => {
          e.stopPropagation();
          useDAWStore.getState().setBottomPanel('piano-roll');
      }}
      className={`group absolute h-20 top-2 rounded-md border-2 overflow-hidden cursor-grab active:cursor-grabbing ${isSelected ? 'border-white z-10 shadow-lg' : 'border-transparent shadow-sm'}`}
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
        <div className="px-2 py-1 text-xs font-bold text-black/60 truncate flex justify-between items-center relative z-10">
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
                    aria-label={`Delete ${clip.name || (clip.type === 'midi' ? 'MIDI Clip' : 'Audio Clip')}`}
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
            {/* Takes selector */}
            {clip.takes && clip.takes.length > 1 && !isEditing && (
                <select
                    value={clip.activeTakeId || ''}
                    onChange={(e) => {
                      e.stopPropagation();
                      switchTake(clip.id, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 ml-1 text-[9px] bg-black/30 text-white border-none rounded px-0.5 cursor-pointer max-w-16"
                    aria-label="Switch take"
                >
                    {clip.takes.map(take => (
                      <option key={take.id} value={take.id}>{take.name}</option>
                    ))}
                </select>
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
                 <div style={{
                   width: clip.originalDuration ? `${(clip.originalDuration / clip.duration) * 100}%` : '100%',
                   height: '100%',
                   left: clip.originalDuration
                     ? `${-((clip.audioEdit?.sourceOffsetSeconds ?? 0) * bpm / 60 / clip.duration) * 100}%`
                     : 0,
                   position: 'absolute',
                   transform: clip.audioEdit?.reversed ? 'scaleX(-1)' : undefined,
                 }}>
                     <AudioWaveform url={clip.bufferUrl} />
                 </div>
                 {(clip.audioEdit?.fadeInBeats ?? 0) > 0 && (
                   <div className="absolute inset-y-0 left-0 bg-black/40" style={{ width: `${Math.min(100, clip.audioEdit!.fadeInBeats / clip.duration * 100)}%`, clipPath: 'polygon(0 100%, 100% 0, 100% 100%)' }} />
                 )}
                 {(clip.audioEdit?.fadeOutBeats ?? 0) > 0 && (
                   <div className="absolute inset-y-0 right-0 bg-black/40" style={{ width: `${Math.min(100, clip.audioEdit!.fadeOutBeats / clip.duration * 100)}%`, clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }} />
                 )}
            </div>
        )}
        
        {/* Resize / Trim Handles */}
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
                let finalStart = startBeat;
                
                const onMove = (moveEvent: PointerEvent) => {
                    const diffPx = moveEvent.clientX - startX;
                    const diffBeats = diffPx / PIXELS_PER_BEAT;
                    const snappedDiff = Math.round(diffBeats / SNAP) * SNAP;
                    const availableBeforeBeats = clip.type === 'audio'
                      ? (clip.audioEdit?.sourceOffsetSeconds ?? 0) * bpm / 60
                      : startBeat;
                    const boundedDiff = Math.max(-Math.min(startBeat, availableBeforeBeats), snappedDiff);
                    if (startDur - boundedDiff >= SNAP && Math.abs(boundedDiff) >= SNAP / 2) {
                       finalStart = startBeat + boundedDiff;
                       if (clip.type !== 'audio') updateClip(clip.id, { start: finalStart, duration: startDur - boundedDiff });
                    }
                };
                
                const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    if (clip.type === 'audio' && Math.abs(finalStart - startBeat) >= SNAP / 2) trimClipStart(clip.id, finalStart);
                };
                
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            }}
        />
        <div 
            draggable
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const startX = e.clientX;
                const startDur = clip.duration;
                let finalDuration = startDur;
                
                const onMove = (moveEvent: PointerEvent) => {
                    const diffPx = moveEvent.clientX - startX;
                    const diffBeats = diffPx / PIXELS_PER_BEAT;
                    let newDur = Math.max(SNAP, Math.round((startDur + diffBeats) / SNAP) * SNAP);
                    if (clip.type === 'audio' && clip.originalDuration) {
                        const offsetBeats = (clip.audioEdit?.sourceOffsetSeconds ?? 0) * useDAWStore.getState().bpm / 60;
                        newDur = Math.min(newDur, Math.max(SNAP, clip.originalDuration - offsetBeats));
                    }
                    finalDuration = newDur;
                    if (clip.type !== 'audio') updateClip(clip.id, { duration: newDur });
                };
                
                const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    if (clip.type === 'audio' && Math.abs(finalDuration - startDur) >= SNAP / 2) {
                      trimClipEnd(clip.id, clip.start + finalDuration);
                    }
                };
                
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            }}
        />
    </div>
  );
}

export const ClipItem = React.memo(ClipItemComponent);
