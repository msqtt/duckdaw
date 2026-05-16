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
import { useDAWStore } from './store/dawStore';
import { engine } from './lib/audioEngine';

export default function App() {
  const { tracks, clips, togglePlay, stop, bottomPanel } = useDAWStore();
  const [init, setInit] = useState(false);

  useEffect(() => {
    // Keyboard shortcuts
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        
        if (Tone.context.state !== 'running') {
            await engine.initialize();
            setInit(true);
        }
        
        const state = useDAWStore.getState();
        if (state.isPlaying) {
          engine.pause();
        } else {
          engine.play();
        }
        togglePlay();
      } else if (e.code === 'Enter') {
         engine.stop();
         stop();
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
    </div>
  );
}
