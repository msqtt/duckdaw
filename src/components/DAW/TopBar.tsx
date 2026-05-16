import React, { useState } from 'react';
import * as Tone from 'tone';
import { Play, Square, Circle, Settings2, Download, Mic } from 'lucide-react';
import { useDAWStore } from '../../store/dawStore';
import { engine } from '../../lib/audioEngine';
import { SettingsModal } from './SettingsModal';

export function TopBar() {
  const { isPlaying, isRecording, togglePlay, stop, toggleRecording, bpm, setBpm } = useDAWStore();
  const [showSettings, setShowSettings] = useState(false);

  const handlePlay = async () => {
    if (Tone.context.state !== 'running') {
      await engine.initialize();
    }
    if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
    togglePlay();
  };

  const handleStop = () => {
    engine.stop();
    stop();
  };

  const handleExport = () => {
    if (confirm('Exporting the project requires rendering. Would you like to proceed? (This is a simplified web version)')) {
        // Here we would use Tone.Offline to render the complete composition to a WAV file.
        // For the scope of this demo, we can just notify the user.
        console.log("Export triggered");
    }
  };

  const handleMicRecord = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        alert("Microphone access granted. Ready to record audio clips (not fully implemented in MVP).");
        // We would process stream with MediaRecorder and Tone.UserMedia here
        stream.getTracks().forEach(track => track.stop());
    } catch (e: any) {
        console.error("Microphone access denied", e);
        if (window.self !== window.top) {
            alert("Microphone access denied. Please open the app in a new tab to use the microphone.");
        } else {
            alert("Microphone access denied: " + e.message);
        }
    }
  };

  return (
    <div className="h-14 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-300 dark:border-neutral-800 flex items-center justify-between px-4 text-neutral-700 dark:text-neutral-300 select-none">
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-widest flex items-center gap-2">
            🦆 Duck<span className="text-emerald-600 dark:text-emerald-500">DAW</span>
        </h1>
        
        {/* Transport Controls */}
        <div className="flex items-center gap-2 bg-neutral-200 dark:bg-neutral-800 rounded-md p-1">
          <button 
            className="p-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors"
            onClick={handleStop}
          >
            <Square size={20} className="fill-neutral-600 dark:fill-neutral-300" />
          </button>
          <button 
            className={`p-2 rounded transition-colors ${isPlaying ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            onClick={handlePlay}
          >
            <Play size={20} className={isPlaying ? 'fill-emerald-600 dark:fill-emerald-500' : 'fill-neutral-600 dark:fill-neutral-300'} />
          </button>
          <button 
            className={`p-2 rounded transition-colors ${isRecording ? 'bg-red-500/20 text-red-600 dark:text-red-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            onClick={toggleRecording}
            title="Record Midi"
          >
            <Circle size={20} className={isRecording ? 'fill-red-600 dark:fill-red-500' : 'fill-neutral-600 dark:fill-neutral-300'} />
          </button>
          <button 
            className="p-2 rounded transition-colors hover:bg-neutral-300 dark:hover:bg-neutral-700"
            onClick={handleMicRecord}
            title="Record Audio (Mic)"
          >
            <Mic size={20} className="fill-neutral-600 dark:fill-neutral-300" />
          </button>
        </div>

        {/* Global Settings */}
        <div className="flex items-center gap-4 bg-neutral-200 dark:bg-neutral-800 rounded-md px-3 py-1.5 h-10">
          <div className="flex items-center gap-2 cursor-col-resize"
               onWheel={(e) => {
                 const newBpm = Math.max(20, Math.min(300, bpm - Math.sign(e.deltaY)));
                 setBpm(newBpm);
                 engine.setBpm(newBpm);
               }}>
            <span className="text-xs uppercase text-neutral-500 font-bold">BPM</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-500 font-bold text-lg">{bpm}</span>
          </div>
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-neutral-500 font-bold">Time</span>
            <span className="font-mono text-neutral-900 dark:text-white text-sm">4/4</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button 
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded text-sm transition-colors text-neutral-700 dark:text-neutral-300"
            onClick={handleExport}
        >
          <Download size={16} />
          <span>Export</span>
        </button>
        <button 
          className="p-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors"
          onClick={() => setShowSettings(true)}
        >
          <Settings2 size={20} />
        </button>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
