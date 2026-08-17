/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { TopBar } from './components/DAW/TopBar';
import { ArrangeView } from './components/DAW/ArrangeView';
import { PianoRoll } from './components/DAW/PianoRoll';
import { Mixer } from './components/DAW/Mixer';
import { ExportModal } from './components/DAW/ExportModal';
import { dawStore, useDAWStore } from './store/dawStore';
import { engine } from './lib/audioEngine';
import { MidiCapture, connectMidiInputs } from './lib/midiInput';
import { secondsToBeats, transportPositionToBeats } from './lib/time';
import {
  clearRecoverySnapshot,
  getRecoverySnapshot,
  openProject,
  restoreRecoverySnapshot,
  saveProject,
  saveRecoverySnapshot,
} from './lib/projectStorage';
import toast, { Toaster } from 'react-hot-toast';

export default function DAWApp() {
  const { tracks, clips, activeArrangementId, togglePlay, stop, bottomPanel, bpm, timeSignature, isLooping, metronomeOn, metronomeSound, metronomeVolume, metronomeSubdivisions, masterVolume, loopStart, loopEnd, isRecording, isMicRecording, isDirty } = useDAWStore();
  const [init, setInit] = useState(false);
  const micRecordingStartBeat = useRef(0);
  const micRecordingTrackId = useRef<string | null>(null);
  const midiCapture = useRef(new MidiCapture());
  const midiDisconnect = useRef<(() => void) | null>(null);
  const midiRecordingTrackId = useRef<string | null>(null);
  const midiRecordingStartBeat = useRef(0);

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

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) dawStore.temporal.getState().redo();
        else dawStore.temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        dawStore.temporal.getState().redo();
        return;
      }

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
              const playheadBeat = Tone.Transport.ticks / Tone.Transport.PPQ;
              state.pasteClips(playheadBeat);
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
          const result = await saveProject(forceDialog);
          if (result === 'saved' || result === 'downloaded') {
            toast.success(forceDialog ? 'Project saved as new file' : 'Project saved');
          }
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

  useEffect(() => {
    let active = true;
    getRecoverySnapshot().then(async (snapshot) => {
      if (!active || !snapshot) return;
      const shouldRestore = window.confirm('A newer DuckDAW recovery snapshot is available. Restore it now?');
      if (shouldRestore) {
        await restoreRecoverySnapshot();
        if (active) toast.success('Recovered autosaved project');
        return;
      }
      const shouldDiscard = window.confirm('Discard the recovery snapshot? Choose Cancel to keep it for later.');
      if (shouldDiscard) await clearRecoverySnapshot();
    }).catch((error) => {
      if (active) toast.error(`Recovery check failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, []);

  // Save an independent recovery snapshot shortly after each persisted edit.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = dawStore.subscribe((state, previous) => {
      const persistedStateChanged = state.projectName !== previous.projectName
        || state.bpm !== previous.bpm
        || state.timeSignature !== previous.timeSignature
        || state.isLooping !== previous.isLooping
        || state.loopStart !== previous.loopStart
        || state.loopEnd !== previous.loopEnd
        || state.metronomeOn !== previous.metronomeOn
        || state.metronomeSound !== previous.metronomeSound
        || state.metronomeVolume !== previous.metronomeVolume
        || state.metronomeSubdivisions !== previous.metronomeSubdivisions
        || state.masterVolume !== previous.masterVolume
        || state.tracks !== previous.tracks
        || state.clips !== previous.clips
        || state.markers !== previous.markers
        || state.arrangements !== previous.arrangements
        || state.activeArrangementId !== previous.activeArrangementId;
      if (!state.isDirty || !persistedStateChanged) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!dawStore.getState().isDirty) return;
        try {
          await saveRecoverySnapshot();
        } catch (error) {
          if (active) toast.error(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, 2_000);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Sync state to audio engine
    engine.syncTracks(tracks);
    engine.syncClips(clips.filter(clip => clip.arrangementId === activeArrangementId));
  }, [tracks, clips, activeArrangementId]);

  useEffect(() => {
    engine.setBpm(bpm);
    engine.setTimeSignature(timeSignature);
  }, [bpm, timeSignature]);

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
    const handleMidiRecording = async () => {
      const state = useDAWStore.getState();
      if (state.isRecording) {
        const track = state.tracks.find(candidate => candidate.id === state.selectedTrackId);
        if (!track || track.type !== 'midi') {
          toast.error('Select a MIDI track before recording');
          state.toggleRecording();
          return;
        }
        const startBeat = transportPositionToBeats(Tone.Transport.position.toString(), state.timeSignature);
        midiRecordingTrackId.current = track.id;
        midiRecordingStartBeat.current = startBeat;
        midiCapture.current.start(startBeat);
        try {
          midiDisconnect.current = await connectMidiInputs(data => {
            const current = useDAWStore.getState();
            const beat = transportPositionToBeats(Tone.Transport.position.toString(), current.timeSignature);
            midiCapture.current.handleMessage(data, beat);
          });
          if (!state.isPlaying) {
            engine.play();
            state.togglePlay();
          }
        } catch (error) {
          midiRecordingTrackId.current = null;
          toast.error(`MIDI recording unavailable: ${error instanceof Error ? error.message : String(error)}`);
          state.toggleRecording();
        }
      } else if (midiDisconnect.current) {
        midiDisconnect.current();
        midiDisconnect.current = null;
        const endBeat = transportPositionToBeats(Tone.Transport.position.toString(), state.timeSignature);
        const notes = midiCapture.current.stop(endBeat);
        const trackId = midiRecordingTrackId.current;
        midiRecordingTrackId.current = null;
        if (trackId && notes.length > 0) {
          state.commitMidiRecording(
            trackId,
            midiRecordingStartBeat.current,
            Math.max(1 / 4, endBeat - midiRecordingStartBeat.current),
            notes,
          );
        }
      }
    };
    void handleMidiRecording();
    return () => {
      midiDisconnect.current?.();
    };
  }, [isRecording]);

  useEffect(() => {
    const handleMicState = async () => {
      const state = useDAWStore.getState();

      if (state.isMicRecording) {
        const track = state.tracks.find(candidate => candidate.id === state.selectedTrackId);
        if (!track || track.type !== 'audio') {
          toast.error('Select an Audio track before recording');
          state.toggleMicRecording();
          return;
        }
        try {
          micRecordingTrackId.current = track.id;
          micRecordingStartBeat.current = transportPositionToBeats(
            Tone.Transport.position.toString(),
            state.timeSignature,
          );
          await engine.micRecorder.start();
          if (!state.isPlaying) {
             engine.play();
             state.togglePlay();
          }
        } catch (error) {
          micRecordingTrackId.current = null;
          toast.error(`Microphone access failed: ${error instanceof Error ? error.message : String(error)}`);
          state.toggleMicRecording();
        }
      } else if (engine.micRecorder.mediaRecorder?.state !== 'inactive') {
        const recording = await engine.micRecorder.stop();
        const trackId = micRecordingTrackId.current;
        micRecordingTrackId.current = null;
        if (recording && trackId) {
          const durationBeats = secondsToBeats(recording.durationSeconds, state.bpm);
          state.addClip(trackId, micRecordingStartBeat.current, recording.url, durationBeats, recording.mimeType);
        }
      }
    };
    void handleMicState();
  }, [isMicRecording]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const handleChange = () => {
      const state = useDAWStore.getState();
      if (state.theme === 'system') state.toggleTheme('system');
    };
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

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
