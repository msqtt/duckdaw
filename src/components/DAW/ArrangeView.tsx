import { useDAWStore, Track, Clip } from '../../store/dawStore';
import { Volume2, VolumeX, Headphones, Plus, Trash2, Edit2, Music, Mic } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Dropdown } from '../ui/Dropdown';

const SNAP_TO_BEAT = 1; // 1 beat

let currentDragContext: { id: string, duration: number, offsetX: number } | null = null;

function TrackHeader({ track, index }: { track: Track, index: number, key?: React.Key }) {
  const { updateTrack, selectTrack, selectedTrackId, deleteTrack, reorderTrack } = useDAWStore();
  const isSelected = selectedTrackId === track.id;
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(track.name);

  return (
    <div 
      draggable={!isEditing}
      onDragStart={(e) => {
          e.dataTransfer.setData('trackIndex', index.toString());
          e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
          if (e.dataTransfer.types.includes('trackIndex')) e.preventDefault();
      }}
      onDrop={(e) => {
          const fromIndex = e.dataTransfer.getData('trackIndex');
          if (fromIndex) {
              e.preventDefault();
              reorderTrack(useDAWStore.getState().tracks[parseInt(fromIndex)].id, index);
          }
      }}
      className={`h-24 border-b border-neutral-300 dark:border-neutral-800 flex flex-col p-2 select-none transition-colors cursor-grab active:cursor-grabbing ${isSelected ? 'bg-neutral-200 dark:bg-neutral-800' : 'bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800/50'}`}
      onClick={() => selectTrack(track.id)}
    >
      <div className="flex items-center justify-between mb-2">
        {isEditing ? (
            <input 
                autoFocus
                className="w-full bg-transparent text-sm font-semibold outline-none text-neutral-900 dark:text-neutral-100 border-b border-emerald-500"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={() => {
                    setIsEditing(false);
                    if (nameInput.trim()) updateTrack(track.id, { name: nameInput.trim() });
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                }}
            />
        ) : (
            <span 
                className="text-sm font-semibold truncate text-neutral-800 dark:text-neutral-200 flex-1 cursor-text"
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                }}
            >
                {track.name}
            </span>
        )}
        <div className="flex gap-1 items-center ml-2">
          <input 
              type="color" 
              value={track.color}
              onChange={(e) => updateTrack(track.id, { color: e.target.value })}
              className="w-4 h-4 p-0 border-0 rounded cursor-pointer shrink-0 opacity-80 hover:opacity-100"
          />
          <button 
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isMuted ? 'bg-orange-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { isMuted: !track.isMuted }); }}
          >
            M
          </button>
          <button 
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isSolo ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { isSolo: !track.isSolo }); }}
          >
            S
          </button>
          <button 
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-red-500 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
            title="Delete Track"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      
      <div 
        draggable
        onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        className="flex items-center gap-2 mt-auto"
      >
        <Volume2 size={14} className="text-neutral-500" />
        <input 
          type="range" 
          min="0" max="1" step="0.01" 
          value={track.volume}
          onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
}

function ClipItem({ clip, trackColor, onContextMenu }: { clip: Clip, trackColor: string, onContextMenu?: React.MouseEventHandler, key?: React.Key }) {
  const { selectClip, selectedClipIds, updateClip, duplicateClip, deleteClip, zoom, snapToGrid, snapGridSize } = useDAWStore();
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
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  
  const handleDragEnd = () => {
    currentDragContext = null;
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
                    onClick={(e) => { e.stopPropagation(); deleteClip(clip.id); }}
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
            <div className="absolute inset-x-0 bottom-2 top-6 flex items-center justify-center opacity-30 pointer-events-none">
                 {/* Basic representation of a waveform for audio files */}
                 <div className="w-full h-full object-cover px-2 flex items-center gap-[1px]">
                    {Array.from({ length: 40 }).map((_, i) => (
                        <div key={i} className="flex-1 bg-black dark:bg-white rounded-full mx-px" style={{ height: `${20 + Math.random() * 80}%` }} />
                    ))}
                 </div>
            </div>
        )}
        
        {/* Resize Handles */}
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
                    const newDur = Math.max(SNAP, Math.round((startDur + diffBeats) / SNAP) * SNAP);
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

export function ArrangeView() {
  const { tracks, clips, addTrack, addClip, selectedTrackId, zoom, setZoom, updateClip, duplicateClip, selectClip, selectedClipIds, deleteClip, snapGridSize, snapToGrid } = useDAWStore();
  const PIXELS_PER_BEAT = zoom; 
  const SNAP = snapToGrid ? snapGridSize : 0.015625; 
  const VISUAL_SNAP = snapGridSize;
  const totalBeats = 1000; // Large timeline
  
  // Dynamic SVG Generator for Grid
  const gridSVG = encodeURIComponent(`
    <svg width="${PIXELS_PER_BEAT * 4}" height="24" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0v24" stroke="rgba(128,128,128,0.3)" fill="none"/>
      ${Array.from({ length: Math.round(4 / VISUAL_SNAP) - 1 }).map((_, i) => {
        const x = (i + 1) * VISUAL_SNAP * PIXELS_PER_BEAT;
        const isBeat = (i + 1) * VISUAL_SNAP % 1 < 0.001 || (i + 1) * VISUAL_SNAP % 1 > 0.999;
        return `<path d="M${x} 0v24" stroke="rgba(128,128,128,${isBeat ? '0.15' : '0.05'})" stroke-dasharray="${isBeat ? '' : '1,3'}" fill="none"/>`;
      }).join('')}
    </svg>
  `);


  const [marquee, setMarquee] = useState<{ xA: number, yA: number, xB: number, yB: number } | null>(null);
  const [dragSnap, setDragSnap] = useState<{ trackId: string, beat: number, widthBeats?: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDragEndGlobal = () => {
      setDragSnap(null);
      currentDragContext = null;
    };
    window.addEventListener('dragend', handleDragEndGlobal);
    return () => window.removeEventListener('dragend', handleDragEndGlobal);
  }, []);

  const handleTrackLaneDoubleClick = (trackId: string, e: React.MouseEvent<HTMLDivElement>) => {
      // Don't trigger if we clicked a clip
      if ((e.target as HTMLElement).closest('.cursor-grab')) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const beat = Math.floor(clickX / PIXELS_PER_BEAT);
      addClip(trackId, beat);
  };

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, trackId?: string, beat?: number, clipId?: string } | null>(null);

  useEffect(() => {
     const hideMenu = () => setContextMenu(null);
     window.addEventListener('click', hideMenu);
     return () => window.removeEventListener('click', hideMenu);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.cursor-grab')) return; // Ignored if started on clip
      if (e.button !== 0) return; // Only left click // <--- actually maybe we should skip right click context menu from here! Oh it's restricted to left click. Good.
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const y = e.clientY - rect.top + containerRef.current.scrollTop;
      setMarquee({ xA: x, yA: y, xB: x, yB: y });
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marquee || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const y = e.clientY - rect.top + containerRef.current.scrollTop;
      setMarquee(prev => prev ? { ...prev, xB: x, yB: y } : null);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marquee) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      
      const left = Math.min(marquee.xA, marquee.xB);
      const right = Math.max(marquee.xA, marquee.xB);
      const top = Math.min(marquee.yA, marquee.yB);
      const bottom = Math.max(marquee.yA, marquee.yB);
      
      const TRACK_HEIGHT = 96; // h-24 = 6rem = 96px
      
      const selectedIds: string[] = [];
      tracks.forEach((t, i) => {
          const trackTop = i * TRACK_HEIGHT;
          const trackBottom = trackTop + TRACK_HEIGHT;
          if (bottom >= trackTop && top <= trackBottom) {
              const trackClips = clips.filter(c => c.trackId === t.id);
              trackClips.forEach(c => {
                  const clipLeft = c.start * PIXELS_PER_BEAT;
                  const clipRight = clipLeft + c.duration * PIXELS_PER_BEAT;
                  if (right >= clipLeft && left <= clipRight) {
                      selectedIds.push(c.id);
                  }
              });
          }
      });
      
      if (!e.shiftKey) {
          useDAWStore.setState({ selectedClipIds: selectedIds });
      } else {
          const newSelected = new Set([...selectedClipIds, ...selectedIds]);
          useDAWStore.setState({ selectedClipIds: Array.from(newSelected) });
      }
      
      setMarquee(null);
  };

  const handleDragOverTrack = (trackId: string, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
      
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      let startX = dropX;
      let widthBeats = 4; // default for external files
      
      if (currentDragContext) {
          startX = Math.max(0, dropX - currentDragContext.offsetX);
          widthBeats = currentDragContext.duration;
      }
      
      const snappedBeat = Math.round((startX / PIXELS_PER_BEAT) / SNAP) * SNAP;
      
      if (dragSnap?.trackId !== trackId || dragSnap?.beat !== snappedBeat || dragSnap?.widthBeats !== widthBeats) {
          setDragSnap({ trackId, beat: snappedBeat, widthBeats });
      }
  };

  const handleDragLeaveTrack = (e: React.DragEvent) => {
      // Small debounce could prevent flicker, but nulling is safest strictly when leaving
  };

  const handleDrop = async (trackId: string, e: React.DragEvent) => {
      e.preventDefault();
      setDragSnap(null); // Reset snap guide
      
      const file = e.dataTransfer.files[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;

      if (file && file.type.startsWith('audio/')) {
          const beat = Math.max(0, Math.round((dropX / PIXELS_PER_BEAT) / SNAP) * SNAP);
          const bufferUrl = URL.createObjectURL(file);
          // Wait to decode audio data to get duration
          const ctx = new AudioContext();
          try {
              const arrayBuffer = await file.arrayBuffer();
              const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
              const durationSecs = audioBuffer.duration;
              const durationBeats = (durationSecs / 60) * useDAWStore.getState().bpm;
              
              // We need an audio track to drop this into.
              let targetTrack = tracks.find(t => t.id === trackId);
              if (targetTrack?.type !== 'audio') {
                 useDAWStore.getState().addTrack('audio');
                 const state = useDAWStore.getState();
                 targetTrack = state.tracks[state.tracks.length - 1]; // Assume last track
              }
              if (targetTrack) {
                 useDAWStore.getState().addClip(targetTrack.id, beat, bufferUrl);
                 const newState = useDAWStore.getState();
                 const newClipId = newState.selectedClipIds[newState.selectedClipIds.length - 1];
                 if (newClipId) {
                     updateClip(newClipId, { duration: durationBeats, name: file.name });
                 }
              }
          } catch(err) {
              console.error("Failed decoding dropped audio", err);
          }
          return;
      }
      
      const clipId = e.dataTransfer.getData('text/plain');
      const offsetXStr = e.dataTransfer.getData('offsetX');
      const action = e.dataTransfer.getData('action');
      if (!clipId) return;

      const offsetX = offsetXStr ? parseFloat(offsetXStr) : 0;
      const startX = Math.max(0, dropX - offsetX);
      const beat = Math.round((startX / PIXELS_PER_BEAT) / SNAP) * SNAP;

      if (action === 'copy' || e.altKey) {
          useDAWStore.getState().duplicateClip(clipId);
          // Set new position for copied clip
          const state = useDAWStore.getState();
          const newClipId = state.selectedClipIds[state.selectedClipIds.length - 1];
          if (newClipId) {
             updateClip(newClipId, { trackId, start: beat });
          }
      } else {
          updateClip(clipId, { trackId, start: beat });
      }
  };

  useEffect(() => {
    let animationFrameId: number;
    const updatePlayhead = () => {
      const playhead = document.getElementById('playhead');
      if (playhead && Tone.context.state === 'running') {
        const currentBeat = (Tone.Transport.ticks / Tone.Transport.PPQ); // Quarter notes
        const px = currentBeat * PIXELS_PER_BEAT;
        playhead.style.left = `${px}px`;
        
        // Auto-scroll logic
        if (containerRef.current) {
            const container = containerRef.current;
            const scrollLeft = container.scrollLeft;
            const width = container.clientWidth;
            if (px > scrollLeft + width - 50) { // Auto-scroll right
                container.scrollLeft = px - width + 50;
            } else if (px < scrollLeft) {
                container.scrollLeft = px;
            }
        }
      }
      animationFrameId = requestAnimationFrame(updatePlayhead);
    };
    updatePlayhead();
    return () => cancelAnimationFrame(animationFrameId);
  }, [PIXELS_PER_BEAT]);

  return (
    <div className="flex flex-1 overflow-hidden bg-neutral-50 dark:bg-neutral-900 relative">
      {/* Track Headers Sidebar */}
      <div className="w-64 flex-shrink-0 bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col z-20">
        <div className="h-8 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800/50 flex items-center px-4 justify-between">
            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">TRACKS</span>
            <div className="flex gap-1">
                <Dropdown
                   options={[
                     { value: 'midi', label: 'MIDI Track', icon: <Music size={14} /> },
                     { value: 'audio', label: 'Audio Track', icon: <Mic size={14} /> }
                   ]}
                   onChange={(type) => addTrack(type)}
                   align="right"
                   trigger={
                     <div className="bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 p-1 rounded transition-colors flex items-center justify-center">
                         <Plus size={14} />
                     </div>
                   }
                />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {tracks.map((t, index) => <TrackHeader key={t.id} track={t} index={index} />)}
          
          <Dropdown
               options={[
                 { value: 'midi', label: 'MIDI Track', icon: <Music size={14} /> },
                 { value: 'audio', label: 'Audio Track', icon: <Mic size={14} /> }
               ]}
               onChange={(type) => addTrack(type)}
               className="w-full"
               trigger={
                 <div className="w-full h-12 flex items-center justify-center text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 border-b border-dashed border-neutral-300 dark:border-neutral-800 transition-colors cursor-pointer">
                    <Plus size={20} className="mr-2" /> Add Track
                 </div>
               }
          />
        </div>
      </div>

      {/* Timeline & Clips Area */}
      <div 
        ref={containerRef}
        className="flex-1 flex flex-col overflow-x-auto overflow-y-auto bg-neutral-100 dark:bg-neutral-950 relative custom-scrollbar select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Marquee box */}
        {marquee && (
            <div 
                className="absolute border border-emerald-500 bg-emerald-500/20 z-50 pointer-events-none"
                style={{
                    left: Math.min(marquee.xA, marquee.xB),
                    top: Math.min(marquee.yA, marquee.yB),
                    width: Math.abs(marquee.xB - marquee.xA),
                    height: Math.abs(marquee.yB - marquee.yA)
                }}
            />
        )}
        
        {/* Timeline Ruler */}
        <div 
          className="h-8 border-b border-neutral-300 dark:border-neutral-800 sticky top-0 z-10 flex text-xs text-neutral-500 overflow-visible cursor-crosshair bg-neutral-50 dark:bg-neutral-900"
          style={{ width: `${totalBeats * PIXELS_PER_BEAT}px` }}
          onClick={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
             const beat = clickX / PIXELS_PER_BEAT;
             if (Tone.context.state === 'running' || Tone.Transport.state !== 'stopped') {
                Tone.Transport.position = `0:${beat}:0`;
             }
          }}
        >
          {Array.from({ length: totalBeats / 4 }).map((_, i) => (
            <div 
              key={i} 
              className="pl-1 border-l border-neutral-300 dark:border-neutral-800"
              style={{ width: `${4 * PIXELS_PER_BEAT}px` }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Playhead indicator */}
        <div id="playhead" className="absolute top-0 bottom-0 w-px bg-emerald-500 z-30 pointer-events-none" style={{ left: '0px' }}>
            <div className="w-3 h-3 border border-emerald-500 rounded-full absolute -top-1.5 -translate-x-[calc(50%-0.5px)] bg-neutral-100 dark:bg-neutral-900" />
        </div>

        {/* Track Lanes */}
        <div className="flex flex-col min-h-max pb-32">
          {tracks.map(t => (
            <div 
                key={t.id} 
                className="h-24 border-b border-neutral-300 dark:border-neutral-800 relative bg-repeat"
                style={{ backgroundImage: `url('data:image/svg+xml;utf8,${gridSVG}')`, backgroundSize: `${PIXELS_PER_BEAT * 4}px 96px` }}
                onDoubleClick={(e) => handleTrackLaneDoubleClick(t.id, e)}
                onDragOver={(e) => handleDragOverTrack(t.id, e)}
                onDragLeave={handleDragLeaveTrack}
                onDrop={(e) => handleDrop(t.id, e)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if ((e.target as HTMLElement).closest('.cursor-grab')) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const beat = Math.round((clickX / PIXELS_PER_BEAT) / SNAP) * SNAP;
                    setContextMenu({ x: e.clientX, y: e.clientY, trackId: t.id, beat });
                }}
            >
                {dragSnap?.trackId === t.id && (
                    <div 
                        className="absolute h-20 top-2 rounded-md border-2 border-emerald-500 bg-emerald-500/20 z-40 pointer-events-none transition-all duration-75"
                        style={{ 
                            left: `${dragSnap.beat * PIXELS_PER_BEAT}px`,
                            width: `${(dragSnap.widthBeats || 4) * PIXELS_PER_BEAT}px`
                        }}
                    />
                )}
                {clips.filter(c => c.trackId === t.id).map(c => (
                    <ClipItem 
                        key={c.id} 
                        clip={c} 
                        trackColor={t.color} 
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            selectClip(c.id);
                            setContextMenu({ x: e.clientX, y: e.clientY, clipId: c.id });
                        }}
                    />
                ))}
            </div>
          ))}
        </div>
        
        {/* Context Menu */}
        {contextMenu && (
            <div 
                className="fixed bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded shadow-xl z-50 py-1 text-sm text-neutral-800 dark:text-neutral-200 min-w-32"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
            >
                {contextMenu.clipId ? (
                    <>
                        <button 
                            className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                            onClick={() => {
                                deleteClip(contextMenu.clipId!);
                                setContextMenu(null);
                            }}
                        >
                            Delete
                        </button>
                        <button 
                            className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                            onClick={() => {
                                duplicateClip(contextMenu.clipId!);
                                setContextMenu(null);
                            }}
                        >
                            Duplicate
                        </button>
                    </>
                ) : contextMenu.trackId ? (
                    <>
                        <button 
                            className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                            onClick={() => {
                                addClip(contextMenu.trackId!, contextMenu.beat!);
                                setContextMenu(null);
                            }}
                        >
                            Create Clip
                        </button>
                    </>
                ) : null}
            </div>
        )}

        {/* Zoom Controls */}
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-neutral-800/90 p-2 rounded-full shadow-lg z-50 text-white backdrop-blur-sm">
           <span className="text-xs font-bold px-2 text-neutral-300">ZOOM</span>
           <input 
              type="range"
              min="5" max="80"
              value={zoom}
              onChange={e => setZoom(parseInt(e.target.value))}
              className="w-24 accent-emerald-500"
           />
        </div>
      </div>
    </div>
  );
}
