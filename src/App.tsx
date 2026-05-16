/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { TopBar } from './components/DAW/TopBar';
import { ArrangeView } from './components/DAW/ArrangeView';
import { PianoRoll } from './components/DAW/PianoRoll';
import { useDAWStore } from './store/dawStore';
import { engine } from './lib/audioEngine';

export default function App() {
  const { tracks, clips } = useDAWStore();

  useEffect(() => {
    // Sync state to audio engine
    engine.syncTracks(tracks);
    engine.syncClips(clips);
  }, [tracks, clips]);

  return (
    <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 overflow-hidden font-sans">
      <TopBar />
      <ArrangeView />
      <PianoRoll />
    </div>
  );
}
