import { useDAWStore, Track, Clip } from '../../store/dawStore';
import { Volume2, VolumeX, Headphones, Plus, Trash2, Edit2, Music, Mic, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Dropdown } from '../ui/Dropdown';
import toast from 'react-hot-toast';
import { beatsToTransportPosition } from '../../lib/time';
import { ConfirmModal } from '../ui/ConfirmModal';

const SNAP_TO_BEAT = 1; // 1 beat

import { TrackHeader, currentDragTrackSourceIndex, setTrackDragSource } from './TrackHeader';
import { ClipItem, currentDragContext, setDragContext } from './ClipItem';
import { useShallow } from 'zustand/react/shallow';

export function ArrangeView() {
  const { tracks, clips, addTrack, addClip, selectedTrackId, zoom, setZoom, updateClip, duplicateClip, selectClip, selectedClipIds, deleteClip, deleteTrack, snapGridSize, snapToGrid, timeSignature, loopStart, loopEnd, setLoopRegion, isLooping, toggleLoop, markers, addMarker, updateMarker, deleteMarker, activeArrangementId } = useDAWStore(useShallow(state => ({
      tracks: state.tracks,
      clips: state.clips,
      addTrack: state.addTrack,
      addClip: state.addClip,
      selectedTrackId: state.selectedTrackId,
      zoom: state.zoom,
      setZoom: state.setZoom,
      updateClip: state.updateClip,
      duplicateClip: state.duplicateClip,
      selectClip: state.selectClip,
      selectedClipIds: state.selectedClipIds,
      deleteClip: state.deleteClip,
      deleteTrack: state.deleteTrack,
      snapGridSize: state.snapGridSize,
      snapToGrid: state.snapToGrid,
      timeSignature: state.timeSignature,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      setLoopRegion: state.setLoopRegion,
      isLooping: state.isLooping,
      toggleLoop: state.toggleLoop,
      markers: state.markers,
      addMarker: state.addMarker,
      updateMarker: state.updateMarker,
      deleteMarker: state.deleteMarker,
      activeArrangementId: state.activeArrangementId
  })));
  const PIXELS_PER_BEAT = zoom;
  const activeClips = clips.filter(clip => clip.arrangementId === activeArrangementId);
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
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDragEndGlobal = () => {
      setDragSnap(null);
      setDragTrackDropIndex(null);
      setDragContext(null);
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

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, trackId?: string, beat?: number, clipId?: string, markerId?: string } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
              const trackClips = activeClips.filter(c => c.trackId === t.id);
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
                 useDAWStore.getState().addClip(targetTrack.id, beat, bufferUrl, durationBeats, file.type);
                 const newState = useDAWStore.getState();
                 const newClipId = newState.selectedClipIds[newState.selectedClipIds.length - 1];
                 if (newClipId) {
                     updateClip(newClipId, { name: file.name });
                 }
              }
          } catch(error) {
              URL.revokeObjectURL(bufferUrl);
              toast.error(`Audio decode failed: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
              void ctx.close();
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
      <div 
         className={`flex-shrink-0 bg-neutral-50 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-800 flex flex-col z-20 transition-all duration-300 ${sidebarCollapsed ? 'w-0 overflow-hidden border-r-0' : 'border-r'}`}
         style={{ width: sidebarCollapsed ? 0 : `${sidebarWidth}px`, opacity: sidebarCollapsed ? 0 : 1 }}
      >
        <div className="h-8 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800/50 flex items-center px-4 justify-between">
            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">TRACKS</span>
            <div className="flex gap-1 flex-shrink-0">
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
                <button
                    className="bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 p-1 rounded transition-colors flex items-center justify-center ml-1"
                    onClick={() => setSidebarCollapsed(true)}
                    title="Collapse Sidebar"
                >
                    <ChevronLeft size={14} />
                </button>
            </div>
        </div>
        <div 
           className="flex-1 overflow-y-auto custom-scrollbar" 
           ref={sidebarRef}
           onScroll={(e) => {
               if (containerRef.current) {
                   containerRef.current.scrollTop = e.currentTarget.scrollTop;
               }
           }}
        >
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

      {/* Sidebar Resizer */}
      {!sidebarCollapsed && (
          <div 
             className="w-1.5 hover:bg-emerald-500/50 cursor-col-resize z-30 transition-colors relative flex-shrink-0"
             onPointerDown={(e) => {
                 e.stopPropagation();
                 e.currentTarget.setPointerCapture(e.pointerId);
                 const startX = e.clientX;
                 const startWidth = sidebarWidth;
                 const onMove = (moveEvent: PointerEvent) => {
                     const dx = moveEvent.clientX - startX;
                     const newWidth = Math.max(160, Math.min(600, startWidth + dx));
                     setSidebarWidth(newWidth);
                 };
                 const onUp = () => {
                     window.removeEventListener('pointermove', onMove);
                     window.removeEventListener('pointerup', onUp);
                 };
                 window.addEventListener('pointermove', onMove);
                 window.addEventListener('pointerup', onUp);
             }}
          />
      )}

      {/* Expand sidebar button when collapsed */}
      {sidebarCollapsed && (
          <div className="absolute left-0 top-0 bottom-0 w-8 z-40 p-1 flex mt-8">
             <button
                 className="w-6 h-12 bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-r shadow-md flex items-center justify-center text-neutral-500 hover:text-emerald-500 transition-colors"
                 onClick={() => setSidebarCollapsed(false)}
                 title="Expand Sidebar"
             >
                 <ChevronRight size={16} />
             </button>
          </div>
      )}

      {/* Timeline & Clips Area */}
      <div 
        ref={containerRef}
        className="flex-1 flex flex-col overflow-x-auto overflow-y-auto bg-neutral-100 dark:bg-neutral-950 relative custom-scrollbar select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onScroll={(e) => {
            if (sidebarRef.current) {
                sidebarRef.current.scrollTop = e.currentTarget.scrollTop;
            }
        }}
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
          className="h-8 border-b border-neutral-300 dark:border-neutral-800 sticky top-0 z-40 flex text-xs text-neutral-500 overflow-visible cursor-crosshair bg-neutral-50 dark:bg-neutral-900"
          style={{ width: `${totalBeats * PIXELS_PER_BEAT}px` }}
          onDoubleClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const beat = Math.max(0, clickX / PIXELS_PER_BEAT);
              const snapped = Math.round(beat / SNAP) * SNAP;
              addMarker(snapped, 'New Marker');
              e.stopPropagation();
          }}
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
                     Tone.Transport.position = beatsToTransportPosition(snapped, timeSignature);
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
          
          {/* Markers */}
          {markers.map(marker => (
             <div
               key={marker.id}
               className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-auto"
               style={{ left: `${marker.position * PIXELS_PER_BEAT - 6}px` }}
               onDoubleClick={(event) => {
                 event.stopPropagation();
                 const name = window.prompt('Marker name:', marker.name);
                 if (name?.trim()) updateMarker(marker.id, { name: name.trim() });
               }}
               onContextMenu={(event) => {
                 event.preventDefault();
                 event.stopPropagation();
                 setContextMenu({ x: event.clientX, y: event.clientY, markerId: marker.id });
               }}
               onClick={(e) => {
                 e.stopPropagation();
                 const posStr = beatsToTransportPosition(marker.position, timeSignature);
                 if ((Tone as any).Transport && typeof (Tone as any).Transport.position !== 'undefined') {
                     (Tone as any).Transport.position = posStr;
                 }
               }}
             >
               <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent" style={{ borderTopColor: marker.color }} />
               <div className="w-px flex-1" style={{ backgroundColor: marker.color }} />
               <div className="absolute top-1 left-3 text-[10px] whitespace-nowrap bg-neutral-900 text-white px-1 rounded shadow-sm z-50 pointer-events-none" style={{ backgroundColor: marker.color }}>
                 {marker.name}
               </div>
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
                         Tone.Transport.position = beatsToTransportPosition(snapped, timeSignature);
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
                {activeClips.filter(c => c.trackId === t.id).map(c => (
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
                {contextMenu.markerId ? (
                    <>
                        <button
                            className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                            onPointerDown={(event) => {
                                event.stopPropagation();
                                const marker = markers.find(candidate => candidate.id === contextMenu.markerId);
                                const name = window.prompt('Marker name:', marker?.name ?? 'Marker');
                                if (name?.trim()) updateMarker(contextMenu.markerId!, { name: name.trim() });
                                setContextMenu(null);
                            }}
                        >
                            Rename
                        </button>
                        <label className="flex items-center justify-between gap-3 px-4 py-1.5 hover:bg-emerald-500 hover:text-white cursor-pointer">
                            Color
                            <input
                                type="color"
                                aria-label="Marker color"
                                value={markers.find(marker => marker.id === contextMenu.markerId)?.color ?? '#22c55e'}
                                onChange={(event) => updateMarker(contextMenu.markerId!, { color: event.target.value })}
                                className="w-6 h-5"
                            />
                        </label>
                        <button
                            className="w-full text-left px-4 py-1.5 text-red-500 hover:bg-red-500 hover:text-white"
                            onPointerDown={(event) => {
                                event.stopPropagation();
                                deleteMarker(contextMenu.markerId!);
                                setContextMenu(null);
                            }}
                        >
                            Delete
                        </button>
                    </>
                ) : contextMenu.clipId ? (
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
                                                addClip(contextMenu.trackId!, contextMenu.beat!, url, durationBeats, file.type);
                                                const newState = useDAWStore.getState();
                                                const newClipId = newState.selectedClipIds[newState.selectedClipIds.length - 1];
                                                if (newClipId) {
                                                    updateClip(newClipId, { name: file.name });
                                                }
                                            } catch (error) {
                                                URL.revokeObjectURL(url);
                                                toast.error(`Audio decode failed: ${error instanceof Error ? error.message : String(error)}`);
                                            } finally {
                                                void ctx.close();
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
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-white/95 dark:bg-neutral-800/95 p-2 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-700 z-50 text-neutral-800 dark:text-white backdrop-blur-sm transition-colors">
           <span className="text-xs font-bold px-2 text-neutral-500 dark:text-neutral-300">ZOOM</span>
           <input 
              type="range"
              min="5" max="80"
              value={zoom}
              onChange={e => setZoom(parseInt(e.target.value))}
              className="w-24 accent-emerald-500 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full"
           />
        </div>
      </div>
    </div>
    </>
  );
}