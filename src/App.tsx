/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import * as Tone from 'tone';
import { TopBar } from './components/DAW/TopBar';
import { ArrangeView } from './components/DAW/ArrangeView';
import { PianoRoll } from './components/DAW/PianoRoll';
import { Mixer } from './components/DAW/Mixer';
import { ExportModal } from './components/DAW/ExportModal';
import { useDAWStore } from './store/dawStore';
import { engine } from './lib/audioEngine';

export default function App() {
  const { tracks, clips, togglePlay, stop, bottomPanel, bpm, isLooping, metronomeOn, loopStart, loopEnd } = useDAWStore();
  const [init, setInit] = useState(false);

  useEffect(() => {
    // Keyboard shortcuts
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const state = useDAWStore.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        
        if (Tone.context.state !== 'running') {
            await engine.initialize();
            setInit(true);
        }
        
        if (state.isPlaying) {
          engine.pause();
        } else {
          engine.play();
        }
        togglePlay();
      } else if (e.code === 'Enter') {
         engine.stop();
         stop();
      } else if (e.code === 'Backspace' || e.code === 'Delete') {
         // Delete selected clips
         if (state.selectedClipIds.length > 0) {
             state.selectedClipIds.forEach(id => state.deleteClip(id));
         }
         // Delete selected notes
         if (state.selectedNoteIds.length > 0 && state.bottomPanel === 'piano-roll') {
             // Find which clip these notes belong to. Since we only view one clip at a time in piano roll:
             const currentClipId = state.selectedClipIds[0];
             if (currentClipId) {
                 state.selectedNoteIds.forEach(noteId => state.deleteNote(currentClipId, noteId));
             }
         }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
          e.preventDefault(); // Duplicate
          if (state.selectedClipIds.length > 0 && state.bottomPanel !== 'piano-roll') {
              state.selectedClipIds.forEach(id => state.duplicateClip(id));
          }
          if (state.selectedNoteIds.length > 0 && state.bottomPanel === 'piano-roll') {
              const currentClip = state.clips.find(c => c.id === state.selectedClipIds[0]);
              if (currentClip) {
                  state.selectedNoteIds.forEach(noteId => {
                      const note = currentClip.notes?.find(n => n.id === noteId);
                      if (note) {
                          state.addNote(currentClip.id, { ...note, id: Math.random().toString(36).substr(2, 9), start: note.start + note.duration });
                      }
                  });
              }
          }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
          e.preventDefault(); // Copy
          if (state.selectedClipIds.length > 0 && state.bottomPanel !== 'piano-roll') {
              const copiedClips = state.clips.filter(c => state.selectedClipIds.includes(c.id));
              state.setClipboard('clips', copiedClips);
          } else if (state.selectedNoteIds.length > 0 && state.bottomPanel === 'piano-roll') {
              const currentClip = state.clips.find(c => c.id === state.selectedClipIds[0]);
              if (currentClip && currentClip.notes) {
                  const copiedNotes = currentClip.notes.filter(n => state.selectedNoteIds.includes(n.id));
                  state.setClipboard('notes', copiedNotes);
              }
          }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyX') {
          e.preventDefault(); // Cut
          if (state.selectedClipIds.length > 0 && state.bottomPanel !== 'piano-roll') {
              const copiedClips = state.clips.filter(c => state.selectedClipIds.includes(c.id));
              state.setClipboard('clips', copiedClips);
              state.selectedClipIds.forEach(id => state.deleteClip(id));
          } else if (state.selectedNoteIds.length > 0 && state.bottomPanel === 'piano-roll') {
              const currentClip = state.clips.find(c => c.id === state.selectedClipIds[0]);
              if (currentClip && currentClip.notes) {
                  const copiedNotes = currentClip.notes.filter(n => state.selectedNoteIds.includes(n.id));
                  state.setClipboard('notes', copiedNotes);
                  state.selectedNoteIds.forEach(noteId => state.deleteNote(currentClip.id, noteId));
              }
          }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
          e.preventDefault(); // Paste
          if (state.bottomPanel !== 'piano-roll' && state.clipboardClips.length > 0) {
              // Paste clips
              state.clipboardClips.forEach(clip => {
                  state.duplicateClip(clip.id); // Simple duplication logic. In a real DAW, pastes at playhead.
              });
          } else if (state.bottomPanel === 'piano-roll' && state.clipboardNotes.length > 0) {
              // Paste notes
              const currentClip = state.clips.find(c => c.id === state.selectedClipIds[0]);
              if (currentClip) {
                  state.clipboardNotes.forEach(note => {
                      state.addNote(currentClip.id, { ...note, id: Math.random().toString(36).substr(2, 9), start: note.start + note.duration });
                  });
              }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Sync state to audio engine
    engine.syncTracks(tracks);
    engine.syncClips(clips);
  }, [tracks, clips]);

  useEffect(() => {
    engine.setMetronome(metronomeOn);
  }, [metronomeOn]);

  useEffect(() => {
    engine.setLoop(isLooping, loopStart, loopEnd);
  }, [isLooping, loopStart, loopEnd]);

  useEffect(() => {
    // Initialize system theme
    const state = useDAWStore.getState();
    state.toggleTheme(state.theme);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 overflow-hidden font-sans">
      <TopBar />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <ArrangeView />
        {bottomPanel === 'piano-roll' && <PianoRoll />}
        {bottomPanel === 'mixer' && <Mixer />}
      </div>
      <ExportModal />
    </div>
  );
}
