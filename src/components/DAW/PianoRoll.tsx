import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useDAWStore, Clip, Note } from '../../store/dawStore';

const NOTES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
const OCTAVES = [6, 5, 4, 3, 2, 1]; // From top to bottom
const ROW_HEIGHT = 20;
const BEAT_WIDTH = 40; // Pixels per quarter note

function generateKeys() {
  const keys = [];
  OCTAVES.forEach(octave => {
    NOTES.forEach(note => {
      keys.push({ note: `${note}${octave}`, isBlack: note.includes('#') });
    });
  });
  return keys;
}

const KEYS = generateKeys();

export function PianoRoll() {
  const { clips, tracks, selectedClipIds, updateClip, addNote, deleteNote, updateNote, bottomPanel, setBottomPanel, panelHeight, panelFullScreen, setPanelHeight, setPanelFullScreen, selectedNoteIds, selectNote } = useDAWStore();
  const [clip, setClip] = useState<Clip | null>(null);
  const [clipTrackColor, setClipTrackColor] = useState<string>('#E2E8F0');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [synthPreview, setSynthPreview] = useState<any>(null);
  
  const [marquee, setMarquee] = useState<{ xA: number, yA: number, xB: number, yB: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, noteId?: string, beat?: number } | null>(null);

  useEffect(() => {
     const hideMenu = () => setContextMenu(null);
     window.addEventListener('click', hideMenu);
     return () => window.removeEventListener('click', hideMenu);
  }, []);

  useEffect(() => {
    const c = clips.find(c => selectedClipIds.includes(c.id));
    setClip(c || null);
    if (c) {
        const t = tracks.find(track => track.id === c.trackId);
        if (t) setClipTrackColor(t.color);
    }
    
    // Find matching track and get its synth from Tone.js for preview
    // Note: In a real app we'd expose the synth instance directly or send messages
    // but for now we create a generic preview synth if needed.
  }, [selectedClipIds, clips]);

  useEffect(() => {
    // Setup a basic preview synth
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.volume.value = -12;
    setSynthPreview(synth);
    return () => { synth.dispose(); };
  }, []);

  const handleKeyClick = (noteName: string) => {
     if (synthPreview) {
         synthPreview.triggerAttackRelease(noteName, "8n");
     }
  };

  // Center scroll initially on C4
  useEffect(() => {
    if (scrollRef.current) {
       const initialY = KEYS.findIndex(k => k.note === 'C4') * ROW_HEIGHT - 100;
       scrollRef.current.scrollTop = Math.max(0, initialY);
    }
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const updatePlayhead = () => {
      const playhead = document.getElementById('piano-roll-playhead');
      if (playhead && Tone.context.state === 'running' && clip) {
        const currentBeat = (Tone.Transport.ticks / Tone.Transport.PPQ);
        // Playhead within the clip conceptually
        if (currentBeat >= clip.start && currentBeat <= clip.start + clip.duration) {
           playhead.style.display = 'block';
           const px = (currentBeat - clip.start) * BEAT_WIDTH;
           playhead.style.left = `${px}px`;

           // Auto scroll
           if (scrollRef.current) {
               const container = scrollRef.current;
               const scrollLeft = container.scrollLeft;
               const width = container.clientWidth;
               if (px > scrollLeft + width - 20) {
                   container.scrollLeft = px - width + 20;
               } else if (px < scrollLeft) {
                   container.scrollLeft = px;
               }
           }
        } else {
           playhead.style.display = 'none';
        }
      }
      animationFrameId = requestAnimationFrame(updatePlayhead);
    };
    updatePlayhead();
    return () => cancelAnimationFrame(animationFrameId);
  }, [clip]);

  if (!clip || clip.type !== 'midi') {
    return (
      <div className="h-64 sm:h-80 bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800 flex items-center justify-center text-neutral-500 select-none">
        Select a MIDI clip to edit
      </div>
    );
  }

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.cursor-pointer')) return; // Ignore if on note
    if (e.button !== 0) return; // Only left click
    if (!scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const y = e.clientY - rect.top + scrollRef.current.scrollTop;
    setMarquee({ xA: x, yA: y, xB: x, yB: y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!marquee || !scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const y = e.clientY - rect.top + scrollRef.current.scrollTop;
    setMarquee(prev => prev ? { ...prev, xB: x, yB: y } : null);
  };

  const handleGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    const left = Math.min(marquee.xA, marquee.xB);
    const right = Math.max(marquee.xA, marquee.xB);
    const top = Math.min(marquee.yA, marquee.yB);
    const bottom = Math.max(marquee.yA, marquee.yB);
    
    // Check if it was just a click (movement < 5px)
    if (right - left < 5 && bottom - top < 5) {
        setMarquee(null);
        if (!scrollRef.current) return;
        const SNAP = 0.25;
        const beat = Math.floor(left / BEAT_WIDTH / SNAP) * SNAP;
        const keyIndex = Math.floor(top / ROW_HEIGHT);
        
        if (keyIndex >= 0 && keyIndex < KEYS.length) {
          const noteName = KEYS[keyIndex].note;
          const newNote: Note = {
              id: Math.random().toString(36).substr(2, 9),
              note: noteName,
              start: beat,
              duration: 0.5,
              velocity: 0.8
          };
          addNote(clip.id, newNote);
          handleKeyClick(noteName);
        }
        return;
    }

    // Marquee Selection Logic
    const selectedIds: string[] = [];
    clip.notes?.forEach((note) => {
        const keyIndex = KEYS.findIndex(k => k.note === note.note);
        if (keyIndex === -1) return;
        const noteTop = keyIndex * ROW_HEIGHT;
        const noteBottom = noteTop + ROW_HEIGHT;
        const noteLeft = note.start * BEAT_WIDTH;
        const noteRight = noteLeft + note.duration * BEAT_WIDTH;
        
        if (bottom >= noteTop && top <= noteBottom && right >= noteLeft && left <= noteRight) {
            selectedIds.push(note.id);
        }
    });
    
    if (!e.shiftKey) {
        selectNote(null);
        // have to do it this way to override completely or set states correctly.
        useDAWStore.setState({ selectedNoteIds: selectedIds });
    } else {
        const newSelected = new Set([...selectedNoteIds, ...selectedIds]);
        useDAWStore.setState({ selectedNoteIds: Array.from(newSelected) });
    }
    
    setMarquee(null);
  };

  return (
    <div 
        className={`${panelFullScreen ? 'absolute inset-x-0 bottom-0 top-[3.5rem] z-50' : 'relative'} bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800 flex flex-col select-none`}
        style={!panelFullScreen ? { height: panelHeight } : undefined}
    >
      {!panelFullScreen && (
          <div 
              className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-emerald-500/50 z-20"
              onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const startY = e.clientY;
                  const startHeight = panelHeight;
                  const onMove = (m: PointerEvent) => {
                      setPanelHeight(Math.max(150, Math.min(800, startHeight + (startY - m.clientY))));
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
      <div className="h-8 bg-neutral-200/80 dark:bg-neutral-800/80 border-b border-neutral-300 dark:border-neutral-800 flex items-center px-4 justify-between shrink-0">
        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 shrink-0 select-text">PIANO ROLL ({clip.name || clip.id})</span>
        <div className="flex items-center gap-2">
            <button 
              onClick={() => setPanelFullScreen(!panelFullScreen)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              {panelFullScreen ? '↙' : '↗'}
            </button>
            <button 
              onClick={() => setBottomPanel(null)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white ml-2"
            >
              &times;
            </button>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Keys */}
        <div className="w-16 sm:w-24 shrink-0 bg-neutral-100 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 overflow-hidden relative z-10"
             style={{ marginTop: `-${scrollRef.current?.scrollTop || 0}px` }}>
          {KEYS.map((k, i) => (
            <div 
              key={i}
              className={`flex items-center justify-end pr-1 text-[10px] border-b border-neutral-300 dark:border-neutral-800 cursor-pointer hover:brightness-125 active:brightness-150
                ${k.isBlack ? 'bg-neutral-800 dark:bg-neutral-950 text-neutral-400 dark:text-neutral-500' : 'bg-neutral-50 dark:bg-neutral-200 text-neutral-800'}`}
              style={{ height: ROW_HEIGHT }}
              onMouseDown={() => {
                  if (Tone.context.state !== 'running') Tone.start();
                  handleKeyClick(k.note);
              }}
            >
              {!k.isBlack && k.note.includes('C') ? <span className="font-bold">{k.note}</span> : ''}
              {k.isBlack && <div className="w-full h-full bg-neutral-800" />}
            </div>
          ))}
        </div>

        {/* Grid & Notes */}
        <div 
            className="flex-1 overflow-auto relative bg-neutral-50 dark:bg-neutral-900 custom-scrollbar select-none"
            ref={scrollRef}
            onScroll={(e) => {
                // Force rerender to sync piano keys scroll
                e.currentTarget.parentElement?.firstElementChild?.setAttribute('style', `margin-top: -${e.currentTarget.scrollTop}px`);
            }}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onContextMenu={(e) => {
                e.preventDefault();
                if ((e.target as HTMLElement).closest('.cursor-pointer')) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
                const y = e.clientY - rect.top + e.currentTarget.scrollTop;
                const SNAP = 0.25;
                const beat = Math.floor(x / BEAT_WIDTH / SNAP) * SNAP;
                const keyIndex = Math.floor(y / ROW_HEIGHT);
                if (keyIndex >= 0 && keyIndex < KEYS.length) {
                    setContextMenu({ x: e.clientX, y: e.clientY, beat, noteId: KEYS[keyIndex].note /* storing noteName here temporarily to create notes */ });
                }
            }}
        >
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
          <div 
            className="relative bg-repeat"
            style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='${BEAT_WIDTH}' height='${ROW_HEIGHT}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${ROW_HEIGHT}L${BEAT_WIDTH} ${ROW_HEIGHT}M${BEAT_WIDTH} 0L${BEAT_WIDTH} ${ROW_HEIGHT}' stroke='%232A2A2A' fill='none'/%3E%3Cpath d='M${BEAT_WIDTH/4} 0L${BEAT_WIDTH/4} ${ROW_HEIGHT}M${BEAT_WIDTH/2} 0L${BEAT_WIDTH/2} ${ROW_HEIGHT}M${BEAT_WIDTH*0.75} 0L${BEAT_WIDTH*0.75} ${ROW_HEIGHT}' stroke='%231E1E1E' stroke-dasharray='2,2' fill='none'/%3E%3C/svg%3E")`,
                height: KEYS.length * ROW_HEIGHT,
                width: Math.max(clip.duration * BEAT_WIDTH, 1200)
            }}
            // onClick removed since handled by pointer up
          >
             {clip.notes?.map(note => {
                 const keyIndex = KEYS.findIndex(k => k.note === note.note);
                 if (keyIndex === -1) return null;
                 
                 const isSelected = selectedNoteIds.includes(note.id); // We will implement selectedNoteIds next

                 return (
                     <div 
                        key={note.id}
                        className={`absolute rounded-sm border ${isSelected ? 'border-white z-20' : 'border-black/50 shadow-sm z-10'} transition-colors cursor-pointer group`}
                        style={{
                            left: note.start * BEAT_WIDTH,
                            top: keyIndex * ROW_HEIGHT,
                            width: note.duration * BEAT_WIDTH - 1,
                            height: ROW_HEIGHT - 1,
                            backgroundColor: clipTrackColor
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (e.shiftKey) selectNote(note.id, true);
                            else selectNote(note.id);
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            selectNote(note.id);
                            setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id });
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const initialStart = note.start;
                            const initialKeyIndex = keyIndex;
                            
                            const onMove = (moveEvent: PointerEvent) => {
                                const diffX = moveEvent.clientX - startX;
                                const diffY = moveEvent.clientY - startY;
                                
                                const SNAP = 0.25;
                                const diffBeats = Math.round((diffX / BEAT_WIDTH) / SNAP) * SNAP;
                                const diffKeys = Math.round(diffY / ROW_HEIGHT);
                                
                                const newStart = Math.max(0, initialStart + diffBeats);
                                const newKeyIndex = Math.max(0, Math.min(KEYS.length - 1, initialKeyIndex + diffKeys));
                                
                                updateNote(clip.id, note.id, { 
                                    start: newStart, 
                                    note: KEYS[newKeyIndex].note 
                                });
                            };
                            
                            const onUp = () => {
                                window.removeEventListener('pointermove', onMove);
                                window.removeEventListener('pointerup', onUp);
                            };
                            
                            window.addEventListener('pointermove', onMove);
                            window.addEventListener('pointerup', onUp);
                        }}
                     >
                        <div 
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-white/50"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                e.currentTarget.setPointerCapture(e.pointerId);
                                const startX = e.clientX;
                                const initialDuration = note.duration;
                                
                                const onMove = (moveEvent: PointerEvent) => {
                                    const diffX = moveEvent.clientX - startX;
                                    const SNAP = 0.25;
                                    const diffBeats = Math.round((diffX / BEAT_WIDTH) / SNAP) * SNAP;
                                    const newDuration = Math.max(SNAP, initialDuration + diffBeats);
                                    updateNote(clip.id, note.id, { duration: newDuration });
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
                 );
             })}
             
             {/* Playhead indicator */}
             <div id="piano-roll-playhead" className="absolute top-0 bottom-0 w-px bg-emerald-500 z-30 pointer-events-none hidden" style={{ left: '0px' }}>
                 <div className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-1 -translate-x-[calc(50%-0.5px)]" />
             </div>
          </div>
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
          <div 
              className="fixed bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded shadow-xl z-50 py-1 text-sm text-neutral-800 dark:text-neutral-200 min-w-32"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
          >
              {contextMenu.noteId && clip.notes?.find(n => n.id === contextMenu.noteId) ? (
                  <>
                      <button 
                          className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                          onClick={() => {
                              deleteNote(clip.id, contextMenu.noteId!);
                              setContextMenu(null);
                          }}
                      >
                          Delete
                      </button>
                      <button 
                          className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                          onClick={() => {
                              const note = clip.notes?.find(n => n.id === contextMenu.noteId);
                              if (note) {
                                  addNote(clip.id, { ...note, id: Math.random().toString(36).substr(2, 9), start: note.start + note.duration });
                              }
                              setContextMenu(null);
                          }}
                      >
                          Duplicate
                      </button>
                  </>
              ) : contextMenu.beat !== undefined ? (
                  <>
                      <button 
                          className="w-full text-left px-4 py-1.5 hover:bg-emerald-500 hover:text-white"
                          onClick={() => {
                              const newNote: Note = {
                                  id: Math.random().toString(36).substr(2, 9),
                                  note: contextMenu.noteId!, // Note name was passed here temporarily
                                  start: contextMenu.beat!,
                                  duration: 0.5,
                                  velocity: 0.8
                              };
                              addNote(clip.id, newNote);
                              handleKeyClick(contextMenu.noteId!);
                              setContextMenu(null);
                          }}
                      >
                          Create Note
                      </button>
                  </>
              ) : null}
          </div>
      )}
    </div>
  );
}
