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
  const { clips, tracks, selectedClipId, updateClip, addNote, deleteNote, updateNote } = useDAWStore();
  const [clip, setClip] = useState<Clip | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [synthPreview, setSynthPreview] = useState<any>(null);

  useEffect(() => {
    const c = clips.find(c => c.id === selectedClipId);
    setClip(c || null);
    
    // Find matching track and get its synth from Tone.js for preview
    // Note: In a real app we'd expose the synth instance directly or send messages
    // but for now we create a generic preview synth if needed.
  }, [selectedClipId, clips]);

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
           playhead.style.left = `${(currentBeat - clip.start) * BEAT_WIDTH}px`;
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

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const y = e.clientY - rect.top;

    const beat = Math.floor(x / BEAT_WIDTH); // Assuming 1/4 note snapping
    const keyIndex = Math.floor(y / ROW_HEIGHT);
    
    if (keyIndex >= 0 && keyIndex < KEYS.length) {
      const noteName = KEYS[keyIndex].note;
      
      // Toggle note (if exists, delete, else add)
      const existingNote = clip.notes?.find(n => n.start === beat && n.note === noteName);
      if (existingNote) {
        deleteNote(clip.id, existingNote.id);
      } else {
        const newNote: Note = {
            id: Math.random().toString(36).substr(2, 9),
            note: noteName,
            start: beat,
            duration: 1, // 1 beat duration by default
            velocity: 0.8
        };
        addNote(clip.id, newNote);
        handleKeyClick(noteName); // Preview note on add
      }
    }
  };

  return (
    <div className="h-64 sm:h-96 bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800 flex flex-col relative select-none">
      <div className="h-8 bg-neutral-200/80 dark:bg-neutral-800/80 border-b border-neutral-300 dark:border-neutral-800 flex items-center px-4 justify-between shrink-0">
        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">PIANO ROLL ({clip.id})</span>
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
            className="flex-1 overflow-auto relative bg-neutral-50 dark:bg-neutral-900 custom-scrollbar"
            ref={scrollRef}
            onScroll={(e) => {
                // Force rerender to sync piano keys scroll
                e.currentTarget.parentElement?.firstElementChild?.setAttribute('style', `margin-top: -${e.currentTarget.scrollTop}px`);
            }}
        >
          <div 
            className="relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMjBMNDAgMjBNNDAgMEw0MCAyMCIgc3Ryb2tlPSIjRTJFMkUyIiBmaWxsPSJub25lIi8+PC9zdmc+')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMjBMNDAgMjBNNDAgMEw0MCAyMCIgc3Ryb2tlPSIjMkEyQTJBIiBmaWxsPSJub25lIi8+PC9zdmc+')]"
            style={{ 
                height: KEYS.length * ROW_HEIGHT,
                width: Math.max(clip.duration * BEAT_WIDTH, 1200)
            }}
            onClick={handleGridClick}
          >
             {clip.notes?.map(note => {
                 const keyIndex = KEYS.findIndex(k => k.note === note.note);
                 if (keyIndex === -1) return null;

                 return (
                     <div 
                        key={note.id}
                        className="absolute rounded-sm border border-black/50 shadow-sm transition-transform hover:brightness-110 cursor-pointer"
                        style={{
                            left: note.start * BEAT_WIDTH,
                            top: keyIndex * ROW_HEIGHT,
                            width: note.duration * BEAT_WIDTH - 1,
                            height: ROW_HEIGHT - 1,
                            backgroundColor: clip.color
                        }}
                        onClick={(e) => { e.stopPropagation(); deleteNote(clip.id, note.id); }}
                     />
                 );
             })}
             
             {/* Playhead indicator */}
             <div id="piano-roll-playhead" className="absolute top-0 bottom-0 w-px bg-emerald-500 z-30 pointer-events-none hidden" style={{ left: '0px' }}>
                 <div className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-1 -translate-x-[calc(50%-0.5px)]" />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
