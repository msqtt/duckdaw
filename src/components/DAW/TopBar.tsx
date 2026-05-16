import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Play, Square, Circle, Settings2, Download, Mic, LayoutGrid, Sliders } from 'lucide-react';
import { useDAWStore } from '../../store/dawStore';
import { engine } from '../../lib/audioEngine';
import { SettingsModal } from './SettingsModal';

export function TopBar() {
  const { isPlaying, isRecording, togglePlay, stop, toggleRecording, bpm, setBpm, timeSignature, setTimeSignature, bottomPanel, setBottomPanel } = useDAWStore();
  const [showSettings, setShowSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState('0:00:000');
  const [bpmInput, setBpmInput] = useState(bpm.toString());

  useEffect(() => {
    let animationFrameId: number;
    const updateTime = () => {
      if (Tone.context.state === 'running') {
        const time = Tone.Transport.position as string | number;
        if (typeof time === 'string') {
          const parts = time.split(':');
          if (parts.length >= 3) {
             setCurrentTime(`${parts[0]}:${parts[1]}:${Math.floor(parseFloat(parts[2])).toString().padStart(3, '0')}`);
          }
        } else if (typeof time === 'number') {
           const mins = Math.floor(time / 60);
           const secs = Math.floor(time % 60);
           const ms = Math.floor((time % 1) * 1000);
           setCurrentTime(`${mins}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`);
        }
      }
      animationFrameId = requestAnimationFrame(updateTime);
    };
    updateTime();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

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
     const format = window.prompt('Enter export format (wav, mp3, ogg):', 'wav');
     if (format) {
         alert(`Exporting project to ${format}... (Note: full audio render is simulated in this MVP)`);
         setTimeout(() => {
             const dataStr = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
             const downloadAnchorNode = document.createElement('a');
             downloadAnchorNode.setAttribute("href", dataStr);
             downloadAnchorNode.setAttribute("download", `duckdaw_export.${format.toLowerCase()}`);
             document.body.appendChild(downloadAnchorNode);
             downloadAnchorNode.click();
             downloadAnchorNode.remove();
         }, 1000);
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
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-neutral-500 font-bold">BPM</span>
            <input 
               className="font-mono text-emerald-600 dark:text-emerald-500 font-bold text-lg bg-transparent w-12 outline-none"
               value={bpmInput}
               onChange={(e) => setBpmInput(e.target.value)}
               onBlur={() => {
                   let parsed = parseInt(bpmInput);
                   if (isNaN(parsed) || parsed < 20) parsed = 20;
                   if (parsed > 300) parsed = 300;
                   setBpm(parsed);
                   setBpmInput(parsed.toString());
                   engine.setBpm(parsed);
               }}
               onKeyDown={(e) => {
                   if (e.key === 'Enter') e.currentTarget.blur();
               }}
               onWheel={(e) => {
                 const newBpm = Math.max(20, Math.min(300, bpm - Math.sign(e.deltaY)));
                 setBpm(newBpm);
                 setBpmInput(newBpm.toString());
                 engine.setBpm(newBpm);
               }}
            />
          </div>
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-neutral-500 font-bold">Time</span>
            <span 
              className="font-mono text-neutral-900 dark:text-white text-sm cursor-pointer hover:text-emerald-500 transition-colors"
              onClick={() => {
                  let newNum = timeSignature[0] >= 12 ? 2 : timeSignature[0] + 1;
                  setTimeSignature([newNum, 4]);
              }}
            >
              {timeSignature[0]}/{timeSignature[1]}
            </span>
          </div>
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700" />
          <div className="font-mono w-20 text-center text-sm font-semibold tracking-wider tabular-nums">
             {currentTime}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Panel Toggles */}
        <div className="flex items-center bg-neutral-200 dark:bg-neutral-800 rounded-md p-1 mr-2">
            <button 
                title="Toggle Piano Roll"
                className={`p-1.5 rounded transition-colors ${bottomPanel === 'piano-roll' ? 'bg-neutral-400 dark:bg-neutral-600 text-neutral-900 dark:text-white' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                onClick={() => setBottomPanel(bottomPanel === 'piano-roll' ? null : 'piano-roll')}
            >
                <LayoutGrid size={18} />
            </button>
            <button 
                title="Toggle Mixer"
                className={`p-1.5 rounded transition-colors ${bottomPanel === 'mixer' ? 'bg-neutral-400 dark:bg-neutral-600 text-neutral-900 dark:text-white' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                onClick={() => setBottomPanel(bottomPanel === 'mixer' ? null : 'mixer')}
            >
                <Sliders size={18} />
            </button>
        </div>

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
