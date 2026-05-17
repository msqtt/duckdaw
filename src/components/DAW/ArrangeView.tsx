import { useDAWStore, Track, Clip } from '../../store/dawStore';
import { Volume2, VolumeX, Headphones, Plus, Trash2, Edit2, Music, Mic } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Dropdown } from '../ui/Dropdown';
import { ConfirmModal } from '../ui/ConfirmModal';

const SNAP_TO_BEAT = 1; // 1 beat

let currentDragContext: { id: string, duration: number, offsetX: number } | null = null;
let currentDragTrackSourceIndex: number | null = null;

function TrackHeader({ track, index, onDeletePrompt, dragTargetIndex, setDragTargetIndex }: { track: Track, index: number, key?: React.Key, onDeletePrompt?: (type: 'track'|'clip', id: string) => void, dragTargetIndex?: number | null, setDragTargetIndex?: (i: number | null) => void }) {
  const { updateTrack, selectTrack, selectedTrackId, deleteTrack, reorderTrack } = useDAWStore();
  const isSelected = selectedTrackId === track.id;
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(track.name);

  return (
    <div 
      draggable={!isEditing}
      onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', `track:${index}`);
          e.dataTransfer.setData('trackIndex', index.toString());
          e.dataTransfer.effectAllowed = 'move';
          currentDragTrackSourceIndex = index;
      }}
      onDragOver={(e) => {
          e.preventDefault();
          if (currentDragTrackSourceIndex !== null && setDragTargetIndex) {
               const rect = e.currentTarget.getBoundingClientRect();
               const isTopHalf = (e.clientY - rect.top) < (rect.height / 2);
               setDragTargetIndex(isTopHalf ? index : index + 1);
          }
      }}
      onDragLeave={(e) => {
          // avoid clearing immediately to reduce flicker
      }}
      onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          let fromIndexRaw = e.dataTransfer.getData('trackIndex') || e.dataTransfer.getData('trackindex');
          
          if (!fromIndexRaw) {
              const textPlain = e.dataTransfer.getData('text/plain');
              if (textPlain && textPlain.startsWith('track:')) {
                  fromIndexRaw = textPlain.split(':')[1];
              }
          }

          if (fromIndexRaw) {
              const fromIndex = parseInt(fromIndexRaw);
              const tracks = useDAWStore.getState().tracks;
              const target = dragTargetIndex !== null && dragTargetIndex !== undefined ? dragTargetIndex : index;
              if (!isNaN(fromIndex) && tracks[fromIndex]) {
                  reorderTrack(tracks[fromIndex].id, target);
              }
          }
          currentDragTrackSourceIndex = null;
          if (setDragTargetIndex) setDragTargetIndex(null);
      }}
      onDragEnd={(e) => {
          currentDragTrackSourceIndex = null;
          if (setDragTargetIndex) setDragTargetIndex(null);
      }}
      className={`h-24 border-b border-neutral-300 dark:border-neutral-800 flex flex-col p-2 select-none transition-colors cursor-grab active:cursor-grabbing relative ${isSelected ? 'bg-neutral-200 dark:bg-neutral-800' : 'bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800/50'}`}
      onClick={() => selectTrack(track.id)}
    >
      {dragTargetIndex === index && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500 z-50 pointer-events-none" />
      )}
      {dragTargetIndex === index + 1 && index === useDAWStore.getState().tracks.length - 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500 z-50 pointer-events-none" />
      )}
      <div className="flex items-center justify-between mb-2">
        {isEditing ? (
            <input 
                autoFocus
                className="w-full bg-transparent text-sm font-semibold outline-none text-neutral-900 dark:text-neutral-100 border-b border-emerald-500 ml-2"
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
                className="text-sm font-semibold truncate text-neutral-800 dark:text-neutral-200 flex-1 cursor-text flex items-center pr-2"
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                }}
            >
                <div className="w-5 text-center mr-2 text-xs font-mono text-neutral-400 dark:text-neutral-500 flex-shrink-0">
                    {index + 1}
                </div>
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
            onClick={(e) => { 
                e.stopPropagation(); 
                if (onDeletePrompt) onDeletePrompt('track', track.id);
                else deleteTrack(track.id); 
            }}
            title="Delete Track"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      
      <div 
        draggable
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onPointerDown={(e) => e.stopPropagation()}
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

function AudioWaveform({ url }: { url?: string }) {
   const [peaks, setPeaks] = useState<number[]>([]);
   
   useEffect(() => {
       if (!url) {
           const p = [];
           for(let i=0; i<40; i++) p.push(20 + (Math.sin(i * 0.5) * 40 + 40));
           setPeaks(p);
           return;
       }
       
       let isCancelled = false;
       const ctx = new window.AudioContext();
       fetch(url)
         .then(res => res.arrayBuffer())
         .then(buf => ctx.decodeAudioData(buf))
         .then(audioBuf => {
             if (isCancelled) return;
             const channelData = audioBuf.getChannelData(0);
             const step = Math.ceil(channelData.length / 80); // higher res
             const p = [];
             for(let i=0; i<80; i++) {
                 let min = 1.0;
                 let max = -1.0;
                 for (let j=0; j<step; j++) {
                     const val = channelData[i*step + j];
                     if (val < min) min = val;
                     if (val > max) max = val;
                 }
                 p.push(Math.max(10, Math.abs(max - min) * 100));
             }
             setPeaks(p);
             ctx.close();
         })
         .catch((err) => {
             if(!isCancelled) {
                 const p = [];
                 for(let i=0; i<80; i++) p.push(20 + (Math.sin(i * 0.5) * 40 + 40));
                 setPeaks(p);
             }
             ctx.close();
         });
         
       return () => { isCancelled = true; };
   }, [url]);

   return (
       <div className="w-full h-full object-cover px-1 flex items-center justify-between gap-[1px]">
          {peaks.map((p, i) => (
             <div key={i} className="flex-1 bg-black dark:bg-white rounded-full transition-all" style={{ height: `${p}%` }} />
          ))}
       </div>
   );
}

function ClipItem({ clip, trackColor, onContextMenu, onDeletePrompt }: { clip: Clip, trackColor: string, onContextMenu?: React.MouseEventHandler, key?: React.Key, onDeletePrompt?: (type: 'track'|'clip', id: string) => void }) {
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

export function ArrangeView() {
  const { tracks, clips, addTrack, addClip, selectedTrackId, zoom, setZoom, updateClip, duplicateClip, selectClip, selectedClipIds, deleteClip, snapGridSize, snapToGrid, loopStart, loopEnd, setLoopRegion, isLooping, toggleLoop } = useDAWStore();
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
  const [dragTrackDropIndex, setDragTrackDropIndex] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'track' | 'clip', id: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDragEndGlobal = () => {
      setDragSnap(null);
      setDragTrackDropIndex(null);
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

  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
     const hideMenu = (e: PointerEvent) => {
         if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
             return;
         }
         setContextMenu(null);
     };
     window.addEventListener('pointerdown', hideMenu);
     return () => window.removeEventListener('pointerdown', hideMenu);
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
                 useDAWStore.getState().addClip(targetTrack.id, beat, bufferUrl, durationBeats);
                 const newState = useDAWStore.getState();
                 const newClipId = newState.selectedClipIds[newState.selectedClipIds.length - 1];
                 if (newClipId) {
                     updateClip(newClipId, { name: file.name });
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
      if (!clipId || clipId.startsWith('track:')) return;

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
      const line = document.getElementById('playhead-line');
      const handle = document.getElementById('playhead-handle');
      
      const px = (Tone.context.state === 'running') 
        ? (Tone.Transport.ticks / Tone.Transport.PPQ) * PIXELS_PER_BEAT
        : (Tone.Transport.position ? parseFloat(Tone.Transport.position.toString().split(':')[1] || "0") * PIXELS_PER_BEAT : 0);

      if (line) line.style.left = `${px}px`;
      if (handle) handle.style.left = `${px}px`;

      if (Tone.context.state === 'running') {
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
    <>
      <ConfirmModal 
         isOpen={deleteConfirm !== null}
         onClose={() => setDeleteConfirm(null)}
         title={deleteConfirm?.type === 'track' ? "Delete Track" : "Delete Clip"}
         message={`Are you sure you want to delete this ${deleteConfirm?.type}? This action cannot be undone.`}
         onConfirm={() => {
             if (deleteConfirm?.type === 'track') deleteTrack(deleteConfirm.id);
             else if (deleteConfirm?.type === 'clip') deleteClip(deleteConfirm.id);
         }}
      />
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
          {tracks.map((t, index) => <TrackHeader key={t.id} track={t} index={index} onDeletePrompt={((type, id) => setDeleteConfirm({ type, id }))} dragTargetIndex={dragTrackDropIndex} setDragTargetIndex={setDragTrackDropIndex} />)}
          
          <Dropdown
               options={[
                 { value: 'midi', label: 'MIDI Track', icon: <Music size={14} /> },
                 { value: 'audio', label: 'Audio Track', icon: <Mic size={14} /> }
               ]}
               onChange={(type) => addTrack(type)}
               className="w-full block"
               triggerClassName="w-full"
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
          onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const startX = e.clientX - rect.left;
              const startBeat = Math.max(0, startX / PIXELS_PER_BEAT);
              
              let isDragging = false;

              const onMove = (moveEvent: PointerEvent) => {
                  isDragging = true;
                  const currentX = moveEvent.clientX - rect.left;
                  const currentBeat = Math.max(0, currentX / PIXELS_PER_BEAT);
                  const minB = Math.min(startBeat, currentBeat);
                  const maxB = Math.max(startBeat, currentBeat);
                  const snappedMin = Math.round(minB / SNAP) * SNAP;
                  const snappedMax = Math.max(snappedMin + SNAP, Math.round(maxB / SNAP) * SNAP);
                  setLoopRegion(snappedMin, snappedMax);
                  if (!isLooping) toggleLoop();
              };

              const onUp = (upEvent: PointerEvent) => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  if (!isDragging) {
                     const clickX = upEvent.clientX - rect.left;
                     const beat = Math.max(0, clickX / PIXELS_PER_BEAT);
                     // Set playback position
                     const snapped = Math.round(beat / SNAP) * SNAP;
                     Tone.Transport.position = `0:${snapped}:0`;
                  }
              };

              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
          }}
        >
          {isLooping && (
             <div 
                className="absolute top-0 bottom-0 pointer-events-none z-20"
                style={{
                   left: `${loopStart * PIXELS_PER_BEAT}px`,
                   width: `${(loopEnd - loopStart) * PIXELS_PER_BEAT}px`
                }}
             >
                <div 
                    className="absolute inset-x-3 inset-y-0 bg-emerald-500/10 pointer-events-auto cursor-grab active:cursor-grabbing hover:bg-emerald-500/20 transition-colors" 
                    onPointerDown={(e) => {
                       e.stopPropagation();
                       e.currentTarget.setPointerCapture(e.pointerId);
                       const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
                       const loopWidthBeats = loopEnd - loopStart;
                       const startX = e.clientX;
                       const initialLoopStart = loopStart;
                       
                       const onMove = (moveEvent: PointerEvent) => {
                           const deltaX = moveEvent.clientX - startX;
                           const deltaBeat = deltaX / PIXELS_PER_BEAT;
                           const newStartBeat = Math.max(0, initialLoopStart + deltaBeat);
                           const snappedMin = Math.round(newStartBeat / SNAP) * SNAP;
                           setLoopRegion(snappedMin, snappedMin + loopWidthBeats);
                       };
                       const onUp = () => {
                           window.removeEventListener('pointermove', onMove);
                           window.removeEventListener('pointerup', onUp);
                       };
                       window.addEventListener('pointermove', onMove);
                       window.addEventListener('pointerup', onUp);
                    }}
                />
                <div className="absolute inset-y-0 left-0 w-px bg-emerald-500" />
                <div className="absolute inset-y-0 right-0 w-px bg-emerald-500" />
                
                <div 
                   className="absolute left-0 top-0 bottom-0 w-3 -translate-x-[1.5px] pointer-events-auto cursor-ew-resize hover:bg-emerald-500 hover:opacity-50 transition-colors"
                   onPointerDown={(e) => {
                       e.stopPropagation();
                       e.currentTarget.setPointerCapture(e.pointerId);
                       const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
                       const onMove = (moveEvent: PointerEvent) => {
                           const currentX = moveEvent.clientX - rect.left;
                           const currentBeat = Math.max(0, currentX / PIXELS_PER_BEAT);
                           const snappedMin = Math.round(currentBeat / SNAP) * SNAP;
                           if (snappedMin < loopEnd) {
                              setLoopRegion(snappedMin, loopEnd);
                           }
                       };
                       const onUp = () => {
                           window.removeEventListener('pointermove', onMove);
                           window.removeEventListener('pointerup', onUp);
                       };
                       window.addEventListener('pointermove', onMove);
                       window.addEventListener('pointerup', onUp);
                   }}
                />
                
                <div 
                   className="absolute right-0 top-0 bottom-0 w-3 translate-x-[1.5px] pointer-events-auto cursor-ew-resize hover:bg-emerald-500 hover:opacity-50 transition-colors"
                   onPointerDown={(e) => {
                       e.stopPropagation();
                       e.currentTarget.setPointerCapture(e.pointerId);
                       const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
                       const onMove = (moveEvent: PointerEvent) => {
                           const currentX = moveEvent.clientX - rect.left;
                           const currentBeat = Math.max(0, currentX / PIXELS_PER_BEAT);
                           const snappedMax = Math.round(currentBeat / SNAP) * SNAP;
                           if (snappedMax > loopStart) {
                              setLoopRegion(loopStart, snappedMax);
                           }
                       };
                       const onUp = () => {
                           window.removeEventListener('pointermove', onMove);
                           window.removeEventListener('pointerup', onUp);
                       };
                       window.addEventListener('pointermove', onMove);
                       window.addEventListener('pointerup', onUp);
                   }}
                />
             </div>
          )}
          {Array.from({ length: totalBeats / 4 }).map((_, i) => (
            <div 
              key={i} 
              className="pl-1 border-l border-neutral-300 dark:border-neutral-800"
              style={{ width: `${4 * PIXELS_PER_BEAT}px` }}
            >
              {i + 1}
            </div>
          ))}
          {/* Playhead handle */}
          <div id="playhead-handle" className="absolute top-0 bottom-0 pointer-events-none z-30" style={{ left: '0px' }}>
              <div 
                  className="w-4 h-4 border-2 border-emerald-500 rounded-full absolute top-[calc(50%-8px)] -translate-x-[calc(50%-0.5px)] bg-neutral-100 dark:bg-neutral-900 pointer-events-auto cursor-ew-resize hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors" 
                  onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const container = containerRef.current;
                      if (!container) return;
                      
                      const onMove = (moveEvent: PointerEvent) => {
                         const rect = container.getBoundingClientRect();
                         const x = moveEvent.clientX - rect.left + container.scrollLeft;
                         const beat = Math.max(0, x / PIXELS_PER_BEAT);
                         const snapped = Math.round(beat / SNAP) * SNAP;
                         Tone.Transport.position = `0:${snapped}:0`;
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
        </div>

        {/* Track Lanes */}
        <div className="flex flex-col flex-1 min-h-max pb-32 relative">
          <div id="playhead-line" className="absolute top-0 bottom-0 w-px bg-emerald-500 z-30 pointer-events-none" style={{ left: '0px' }} />
          {dragTrackDropIndex !== null && (
             <div 
                 className="absolute left-0 right-0 h-[2px] bg-emerald-500 z-50 pointer-events-none"
                 style={{ top: `${dragTrackDropIndex * 96}px` }}
             />
          )}
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
                        onDeletePrompt={(type, id) => setDeleteConfirm({ type, id })}
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
                ref={contextMenuRef}
                className="fixed bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded shadow-xl z-50 py-1 text-sm text-neutral-800 dark:text-neutral-200 min-w-32"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
                {contextMenu.clipId ? (
                    <>
                        <button 
                            className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                setContextMenu(null);
                                setDeleteConfirm({ type: 'clip', id: contextMenu.clipId! });
                            }}
                        >
                            Delete
                        </button>
                        <button 
                            className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                duplicateClip(contextMenu.clipId!);
                                setContextMenu(null);
                            }}
                        >
                            Duplicate
                        </button>
                    </>
                ) : contextMenu.trackId ? (
                    <>
                        {tracks.find(t => t.id === contextMenu.trackId)?.type !== 'audio' && (
                            <button 
                                className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    addClip(contextMenu.trackId!, contextMenu.beat!);
                                    setContextMenu(null);
                                }}
                            >
                                Create Clip
                            </button>
                        )}
                        {tracks.find(t => t.id === contextMenu.trackId)?.type === 'audio' && (
                            <label className="block w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white cursor-pointer">
                                Upload Audio
                                <input 
                                    type="file" 
                                    accept="audio/*" 
                                    className="hidden" 
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const url = URL.createObjectURL(file);
                                            const ctx = new AudioContext();
                                            try {
                                                const arrayBuffer = await file.arrayBuffer();
                                                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                                                const durationSecs = audioBuffer.duration;
                                                const durationBeats = (durationSecs / 60) * useDAWStore.getState().bpm;
                                                addClip(contextMenu.trackId!, contextMenu.beat!, url, durationBeats);
                                                const newState = useDAWStore.getState();
                                                const newClipId = newState.selectedClipIds[newState.selectedClipIds.length - 1];
                                                if (newClipId) {
                                                    updateClip(newClipId, { name: file.name });
                                                }
                                            } catch (err) {
                                                addClip(contextMenu.trackId!, contextMenu.beat!, url);
                                            }
                                            setContextMenu(null);
                                        }
                                    }}
                                />
                            </label>
                        )}
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
    </>
  );
}