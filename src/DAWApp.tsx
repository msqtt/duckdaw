/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { TopBar } from './components/DAW/TopBar';
import { ArrangeView } from './components/DAW/ArrangeView';
import { DecisionHost } from './components/ui/DecisionHost';
import { ShortcutHelp } from './components/ui/ShortcutHelp';
import { InputMeter } from './components/DAW/InputMeter';
import { dawStore, useDAWStore } from './store/dawStore';
import { engine } from './lib/audioEngine';
import { usePluginInspectorStore } from './store/pluginInspectorStore';
import { MidiCapture, connectMidiInputs } from './lib/midiInput';
import { MidiInputMeter } from './lib/midiInputMeter';
import { computeCountIn, type CountInBars } from './lib/countIn';
import { requestDecision } from './lib/decisionService';
import { secondsToBeats, transportPositionToBeats } from './lib/time';
import {
  clearRecoverySnapshot,
  getRecoverySnapshot,
  openProject,
  restoreRecoverySnapshot,
  saveProject,
  saveRecoverySnapshot,
} from './lib/projectStorage';
import { useShallow } from 'zustand/react/shallow';
import toast, { Toaster } from 'react-hot-toast';


const PianoRoll = lazy(() => import('./components/DAW/PianoRoll').then(module => ({ default: module.PianoRoll })));
const PluginInspector = lazy(() => import('./components/DAW/PluginInspector').then(module => ({ default: module.PluginInspector })));
const Mixer = lazy(() => import('./components/DAW/Mixer').then(module => ({ default: module.Mixer })));
const ExportModal = lazy(() => import('./components/DAW/ExportModal').then(module => ({ default: module.ExportModal })));
export default function DAWApp() {
  const { tracks, clips, buses, sends, activeArrangementId, togglePlay, stop, bottomPanel, exportModalOpen, bpm, timeSignature, isLooping, metronomeOn, metronomeSound, metronomeVolume, metronomeSubdivisions, masterVolume, loopStart, loopEnd, isRecording, isMicRecording, tempoTrack } = useDAWStore(useShallow(state => ({
    tracks: state.tracks,
    clips: state.clips,
    buses: state.buses,
    sends: state.sends,
    activeArrangementId: state.activeArrangementId,
    togglePlay: state.togglePlay,
    stop: state.stop,
    bottomPanel: state.bottomPanel,
    exportModalOpen: state.exportModalOpen,
    bpm: state.bpm,
    timeSignature: state.timeSignature,
    isLooping: state.isLooping,
    metronomeOn: state.metronomeOn,
    metronomeSound: state.metronomeSound,
    metronomeVolume: state.metronomeVolume,
    metronomeSubdivisions: state.metronomeSubdivisions,
    masterVolume: state.masterVolume,
    loopStart: state.loopStart,
    loopEnd: state.loopEnd,
    isRecording: state.isRecording,
    isMicRecording: state.isMicRecording,
    tempoTrack: state.tempoTrack,
  })));
  const pluginInspectorTarget = usePluginInspectorStore(state => state.target);
  const [init, setInit] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const micRecordingStartBeat = useRef(0);
  const micRecordingTrackId = useRef<string | null>(null);
  const midiCapture = useRef(new MidiCapture());
  const midiDisconnect = useRef<(() => void) | null>(null);
  const midiRecordingTrackId = useRef<string | null>(null);
  const midiRecordingStartBeat = useRef(0);
  const midiMeter = useRef(new MidiInputMeter());

  // Count-in state
  const [countInBars, setCountInBars] = useState<CountInBars>(() => {
    const stored = localStorage.getItem('duckdaw_countin_bars');
    return (stored === '0' || stored === '1' || stored === '2' || stored === '4') ? Number(stored) as CountInBars : 0;
  });
  const [countingIn, setCountingIn] = useState(false);
  const [countInRemaining, setCountInRemaining] = useState(0);

  // Input meter state
  const [midiLevel, setMidiLevel] = useState(0);
  const [midiPeak, setMidiPeak] = useState(0);
  const [midiClipping, setMidiClipping] = useState(false);
  const meterAnimRef = useRef<number>(0);

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
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && !e.altKey && state.bottomPanel !== 'piano-roll') {
         e.preventDefault();
         const playheadBeat = Tone.Transport.ticks / Tone.Transport.PPQ;
         state.selectedClipIds.forEach(id => {
           const clip = state.clips.find(candidate => candidate.id === id);
           if (clip && playheadBeat > clip.start && playheadBeat < clip.start + clip.duration) {
             state.splitClipAtBeat(id, playheadBeat);
           }
         });
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
      } else if (e.key === '?' || e.key === 'F1') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        setShortcutHelpOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  useEffect(() => {
    let active = true;
    getRecoverySnapshot().then(async (snapshot) => {
      if (!active || !snapshot) return;
      const decision = await requestDecision({
        title: 'Recovery snapshot found',
        message: 'A newer DuckDAW recovery snapshot is available. Restore it, discard it, or keep it for later?',
        options: [
          { id: 'later', label: 'Later', kind: 'secondary' },
          { id: 'discard', label: 'Discard', kind: 'danger' },
          { id: 'restore', label: 'Restore', kind: 'primary' },
        ],
      });
      if (!active || !decision || decision.choice === 'later') return;
      if (decision.choice === 'restore') {
        await restoreRecoverySnapshot();
        if (active) toast.success('Recovered autosaved project');
        return;
      }
      if (decision.choice === 'discard') await clearRecoverySnapshot();
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
    // Sync state to audio engine in dependency order.
    engine.syncTracks(tracks);
    engine.syncRouting(tracks, buses, sends);
    engine.syncClips(clips.filter(clip => clip.arrangementId === activeArrangementId));
  }, [tracks, clips, buses, sends, activeArrangementId]);

  useEffect(() => {
    engine.setBpm(bpm);
    engine.setTimeSignature(timeSignature);
  }, [bpm, timeSignature]);

  useEffect(() => {
    engine.syncTempoTrack(tempoTrack);
  }, [tempoTrack]);

  useEffect(() => {
    engine.syncAutomation(tracks);
  }, [tracks]);

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

        // Compute count-in
        const playheadBeat = transportPositionToBeats(Tone.Transport.position.toString(), state.timeSignature);
        const countIn = computeCountIn(
          { bars: countInBars, timeSignature: state.timeSignature, bpm: state.bpm, metronomeEnabled: state.metronomeOn },
          playheadBeat,
        );

        // If count-in is needed, wait for it
        if (countIn.countInBeats > 0) {
          setCountingIn(true);
          setCountInRemaining(countIn.countInBeats);

          // Start playback for count-in
          if (!state.isPlaying) {
            engine.play();
            state.togglePlay();
          }

          // Wait for count-in duration
          const countInSeconds = (countIn.countInBeats / state.bpm) * 60;
          await new Promise<void>((resolve) => {
            let elapsed = 0;
            const interval = setInterval(() => {
              elapsed += 0.1;
              const remaining = Math.max(0, countIn.countInBeats - (elapsed / 60 * state.bpm));
              setCountInRemaining(Math.ceil(remaining));
              if (elapsed >= countInSeconds) {
                clearInterval(interval);
                resolve();
              }
            }, 100);
          });
          setCountingIn(false);
          setCountInRemaining(0);
          if (!useDAWStore.getState().isRecording) return;
        }

        const startBeat = transportPositionToBeats(Tone.Transport.position.toString(), state.timeSignature);
        midiRecordingTrackId.current = track.id;
        midiRecordingStartBeat.current = startBeat;
        midiCapture.current.start(startBeat);

        const selectedDeviceId = localStorage.getItem('duckdaw_midi_device') || undefined;
        try {
          midiDisconnect.current = await connectMidiInputs(data => {
            const current = useDAWStore.getState();
            const beat = transportPositionToBeats(Tone.Transport.position.toString(), current.timeSignature);
            midiCapture.current.handleMessage(data, beat);
            // Feed meter with velocity from noteOn messages
            const status = data[0] & 0xf0;
            if (status === 0x90 && data[2] > 0) {
              midiMeter.current.feed(data[2]);
            }
          }, selectedDeviceId);
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
          // Check if we should overdub onto existing clip
          const existingClip = state.clips.find(c =>
            c.trackId === trackId && c.type === 'midi' &&
            midiRecordingStartBeat.current >= c.start &&
            midiRecordingStartBeat.current < c.start + c.duration
          );
          if (existingClip) {
            state.commitOverdubRecording(existingClip.id, notes);
          } else {
            state.commitMidiRecording(
              trackId,
              midiRecordingStartBeat.current,
              Math.max(1 / 4, endBeat - midiRecordingStartBeat.current),
              notes,
            );
          }
        }
      }
    };
    void handleMidiRecording();
    return () => {
      midiDisconnect.current?.();
    };
  }, [isRecording, countInBars]);

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
          const countIn = computeCountIn({
            bars: countInBars,
            timeSignature: state.timeSignature,
            bpm: state.bpm,
            metronomeEnabled: true,
          }, transportPositionToBeats(Tone.Transport.position.toString(), state.timeSignature));
          if (countIn.countInBeats > 0) {
            setCountingIn(true);
            setCountInRemaining(countIn.countInBeats);
            if (!state.isPlaying) {
              engine.play();
              state.togglePlay();
            }
            const countInSeconds = countIn.countInBeats * 60 / state.bpm;
            await new Promise<void>(resolve => {
              const startedAt = performance.now();
              const interval = window.setInterval(() => {
                const elapsedSeconds = (performance.now() - startedAt) / 1000;
                setCountInRemaining(Math.max(0, Math.ceil(countIn.countInBeats - elapsedSeconds * state.bpm / 60)));
                if (elapsedSeconds >= countInSeconds || !useDAWStore.getState().isMicRecording) {
                  window.clearInterval(interval);
                  resolve();
                }
              }, 100);
            });
            setCountingIn(false);
            setCountInRemaining(0);
            if (!useDAWStore.getState().isMicRecording) return;
          }
        try {
          micRecordingTrackId.current = track.id;
          micRecordingStartBeat.current = transportPositionToBeats(
            Tone.Transport.position.toString(),
            state.timeSignature,
          );
          const selectedDeviceId = localStorage.getItem('duckdaw_audio_device') || undefined;
          await engine.micRecorder.start(selectedDeviceId);
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
  }, [isMicRecording, countInBars]);

  // Meter animation: poll the active MIDI/audio input at ~30fps.
  useEffect(() => {
    let running = true;
    let audioPeak = -60;
    const tick = () => {
      if (!running) return;
      if (isMicRecording) {
        const rawLevel = engine.micRecorder.getInputLevelDb();
        const level = Number.isFinite(rawLevel) ? Math.max(-60, rawLevel) : -60;
        audioPeak = Math.max(audioPeak, level);
        setMidiLevel(level);
        setMidiPeak(audioPeak);
        setMidiClipping(level >= -1);
      } else {
        const mState = midiMeter.current.read();
        setMidiLevel(mState.level);
        setMidiPeak(mState.peak);
        setMidiClipping(mState.isClipping);
      }
      meterAnimRef.current = requestAnimationFrame(tick);
    };
    if (isRecording || isMicRecording) tick();
    return () => {
      running = false;
      cancelAnimationFrame(meterAnimRef.current);
    };
  }, [isRecording, isMicRecording]);

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
      {/* Count-in indicator */}
      {countingIn && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-xl animate-pulse" role="status" aria-live="assertive">
          Count-in: {countInRemaining} beat{countInRemaining !== 1 ? 's' : ''} remaining
        </div>
      )}
      {/* Count-in config bar */}
      <div className="h-7 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center px-4 gap-3 text-xs text-neutral-600 dark:text-neutral-400">
        <label className="flex items-center gap-1">
          Count-in:
          <select
            value={countInBars}
            onChange={(e) => {
              const v = Number(e.target.value) as CountInBars;
              setCountInBars(v);
              localStorage.setItem('duckdaw_countin_bars', String(v));
            }}
            className="bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-1 py-0.5 text-xs"
            aria-label="Count-in bars before recording"
          >
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
            <option value={4}>4 bars</option>
          </select>
        </label>
        {/* Input meter */}
        {(isRecording || isMicRecording) && (
          <InputMeter
            level={midiLevel}
            peak={midiPeak}
            isClipping={midiClipping}
            type={isMicRecording ? 'audio' : 'midi'}
            onClearClip={() => {
              midiMeter.current.clear();
              setMidiClipping(false);
              setMidiPeak(isMicRecording ? -60 : 0);
            }}
          />
        )}
      </div>
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative">
          <ArrangeView />
          <Suspense fallback={null}>
            {bottomPanel === 'piano-roll' && <PianoRoll />}
            {bottomPanel === 'mixer' && <Mixer />}
          </Suspense>
        </div>
        <Suspense fallback={null}>
          {pluginInspectorTarget != null && <PluginInspector />}
        </Suspense>
      </div>
      <Suspense fallback={null}>
        {exportModalOpen && <ExportModal />}
      </Suspense>
      <DecisionHost />
      {shortcutHelpOpen && <ShortcutHelp onClose={() => setShortcutHelpOpen(false)} />}
      <Toaster position="bottom-right" toastOptions={{ ariaProps: { role: 'status', 'aria-live': 'polite' }, className: 'dark:bg-neutral-800 dark:text-neutral-100', style: { borderRadius: '8px', background: '#333', color: '#fff' } }} />
    </div>
  );
}
