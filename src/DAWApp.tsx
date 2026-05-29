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
import { saveProject, openProject } from './lib/projectStorage';
import toast, { Toaster } from 'react-hot-toast';

export default function DAWApp() {
  const { tracks, clips, togglePlay, stop, bottomPanel, bpm, isLooping, metronomeOn, metronomeSound, metronomeVolume, metronomeSubdivisions, masterVolume, loopStart, loopEnd, isMicRecording, isDirty } = useDAWStore();
  const [init, setInit] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDAWStore.getState().isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
    const handleGlobalShortcuts = async (e: KeyboardEvent) => {
      // Allow Ctrl+S / Ctrl+O even if focused inside inputs
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        try {
          const forceDialog = e.shiftKey;
          await saveProject(forceDialog);
          toast.success(forceDialog ? 'Project saved as new file' : 'Project saved');
        } catch (err: any) {
          toast.error(`Save failed: ${err.message}`);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        try {
          const opened = await openProject();
          if (opened) toast.success('Project loaded');
        } catch (err: any) {
          toast.error(`Load failed: ${err.message}`);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  // Autosave periodically
  useEffect(() => {
    let active = true;
    const autosaveInterval = setInterval(async () => {
      const state = useDAWStore.getState();
      if (state.isDirty) {
         try {
            await saveProject(false, true);
            if (active && document.visibilityState === 'visible') {
                toast.success('Autosaved project');
            }
         } catch (err) {
            console.error('Autosave failed:', err);
         }
      }
    }, 3 * 60 * 1000); // 3 minutes
    return () => { active = false; clearInterval(autosaveInterval); };
  }, []);

  useEffect(() => {
    // Sync state to audio engine
    engine.syncTracks(tracks);
    engine.syncClips(clips);
  }, [tracks, clips]);

  useEffect(() => {
    engine.setMetronome(metronomeOn, metronomeSound, metronomeVolume, metronomeSubdivisions);
  }, [metronomeOn, metronomeSound, metronomeVolume, metronomeSubdivisions]);

  useEffect(() => {
    engine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    engine.setLoop(isLooping, loopStart, loopEnd);
  }, [isLooping, loopStart, loopEnd]);

  useEffect(() => {
    const handleMicState = async () => {
      const state = useDAWStore.getState();
      
      if (state.isMicRecording) {
        // Start recording
        try {
          // Check permissions first to be safe
          await navigator.mediaDevices.getUserMedia({ audio: true });
          await engine.micRecorder.start();
          if (!state.isPlaying) {
             engine.play();
             state.togglePlay();
          }
        } catch (e: any) {
          console.error("Microphone access denied", e);
          if (window.self !== window.top) {
              alert("Microphone access denied. Please open the app in a new tab to use the microphone.");
          } else {
              alert("Microphone access denied: " + e.message);
          }
          state.toggleMicRecording(); // toggle back
        }
      } else {
        // Stop recording
        if (engine.micRecorder.mediaRecorder && engine.micRecorder.mediaRecorder.state !== "inactive") {
           const url = await engine.micRecorder.stop();
           if (url && state.selectedTrackId) {
               const track = state.tracks.find(t => t.id === state.selectedTrackId);
               if (track && track.type === 'audio') {
                   // Calculate current position in beats to snap it roughly
                   const pos = Array.isArray(Tone.Transport.position) ? Tone.Transport.position[0] : parseInt(Tone.Transport.position.toString().split(':')[0]);
                   // For now, let's just place it at 0 or position. Since we don't have exactly Tone.js position synced to record time perfectly, let's place it at loopStart or 0 for now.
                   // A better way is Tone.Transport.position beats
                   const parts = Tone.Transport.position.toString().split(':');
                   const currentBeat = parseInt(parts[0]) * 4 + parseInt(parts[1]);
                   state.addClip(state.selectedTrackId, currentBeat, url);
               } else {
                   alert("Please select an Audio track to place the recorded clip.");
               }
           }
        }
      }
    };
    handleMicState();
  }, [isMicRecording]);

  useEffect(() => {
    // Remove the initial loader
    const loader = document.getElementById('initial-loader');
    if (loader && loader.parentNode) {
      loader.parentNode.removeChild(loader);
    }
    
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
      <Toaster position="bottom-right" toastOptions={{ className: 'dark:bg-neutral-800 dark:text-neutral-100', style: { borderRadius: '8px', background: '#333', color: '#fff' } }} />
    </div>
  );
}
