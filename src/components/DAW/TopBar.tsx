import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Play, Square, Circle, Settings2, Download, Mic, LayoutGrid, Sliders, Undo2, Redo2, Repeat, Bell, ChevronDown } from 'lucide-react';
import { useDAWStore, useTemporalStore } from '../../store/dawStore';
import { engine } from '../../lib/audioEngine';
import { SettingsModal } from './SettingsModal';
import { Dropdown } from '../ui/Dropdown';

export function TopBar() {
  const { isPlaying, isRecording, isMicRecording, toggleMicRecording, togglePlay, stop, toggleRecording, bpm, setBpm, timeSignature, setTimeSignature, bottomPanel, setBottomPanel, theme, toggleTheme, setExportModalOpen, isLooping, toggleLoop, metronomeOn, toggleMetronome } = useDAWStore();
  const { undo, redo, pastStates, futureStates } = useTemporalStore((state) => state);
  
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
     setExportModalOpen(true);
  };

  const handleMicRecord = async () => {
    toggleMicRecording();
  };

  const timeSignatureOptions = [
    { value: '2/4', label: '2/4' },
    { value: '3/4', label: '3/4' },
    { value: '4/4', label: '4/4' },
    { value: '5/4', label: '5/4' },
    { value: '6/8', label: '6/8' },
    { value: '7/8', label: '7/8' },
    { value: '9/8', label: '9/8' },
    { value: '12/8', label: '12/8' }
  ];

  const gridSnapOptions = [
    { value: 4, label: 'Bar' },
    { value: 2, label: '1/2' },
    { value: 1, label: '1/4' },
    { value: 2/3, label: '1/4T' },
    { value: 0.5, label: '1/8' },
    { value: 1/3, label: '1/8T' },
    { value: 0.25, label: '1/16' },
    { value: 1/6, label: '1/16T' },
    { value: 0.125, label: '1/32' },
    { value: 1/12, label: '1/32T' }
  ];

  return (
    <div className="h-14 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-300 dark:border-neutral-800 flex items-center justify-between px-4 text-neutral-700 dark:text-neutral-300 select-none">
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-widest flex items-center gap-2">
          🦆 Duck<span className="text-emerald-600 dark:text-emerald-500">DAW</span>
        </h1>
        
        {/* Transport Controls */}
        <div className="flex items-center gap-1 bg-neutral-200 dark:bg-neutral-800 rounded-md p-1">
          <button 
            className="p-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={() => undo()}
            disabled={pastStates.length === 0}
            title="Undo"
          >
            <Undo2 size={18} />
          </button>
          <button 
            className="p-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={() => redo()}
            disabled={futureStates.length === 0}
            title="Redo"
          >
            <Redo2 size={18} />
          </button>
          
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700 mx-1" />
          
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
            className={`p-2 rounded transition-colors ${isMicRecording ? 'bg-red-500/20 text-red-600 dark:text-red-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            onClick={handleMicRecord}
            title="Record Audio (Mic)"
          >
            <Mic size={20} className={isMicRecording ? 'stroke-red-600 dark:stroke-red-500 fill-red-600/20 dark:fill-red-500/20' : 'fill-neutral-600 dark:fill-neutral-300'} />
          </button>
          
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700 mx-1" />
          
          <button 
            className={`p-2 rounded transition-colors ${isLooping ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            onClick={() => {
                toggleLoop();
                if (!isLooping) {
                   Tone.Transport.loop = true;
                   Tone.Transport.loopStart = "0:0:0"; 
                   Tone.Transport.loopEnd = "4:0:0"; // 4 bars basic snap implementation, fix in AudioEngine later
                } else {
                   Tone.Transport.loop = false;
                }
            }}
            title="Cycle Mode"
          >
            <Repeat size={18} />
          </button>
          <button 
            className={`p-2 rounded transition-colors ${metronomeOn ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            onClick={toggleMetronome}
            title="Metronome"
          >
            <Bell size={18} />
          </button>
        </div>

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
             <Dropdown
               options={timeSignatureOptions}
               value={`${timeSignature[0]}/${timeSignature[1]}`}
               onChange={(val) => {
                   const [num, den] = (val as string).split('/').map(Number);
                   setTimeSignature([num, den]);
                   Tone.Transport.timeSignature = [num, den];
               }}
               triggerClassName="bg-transparent font-mono text-neutral-900 dark:text-white text-sm cursor-pointer hover:text-emerald-500 transition-colors focus:outline-none flex items-center gap-1"
             />
          </div>
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700" />
          <div className="flex items-center gap-1.5">
             <button 
                onClick={() => useDAWStore.getState().setSnapToGrid(!useDAWStore.getState().snapToGrid)}
                className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors ${useDAWStore.getState().snapToGrid ? 'text-emerald-500 bg-emerald-500/10' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
             >
                 Grid
             </button>
             <Dropdown
               options={gridSnapOptions}
               value={useDAWStore.getState().snapGridSize}
               disabled={!useDAWStore.getState().snapToGrid}
               onChange={(val) => useDAWStore.getState().setSnapGridSize(parseFloat(val))}
               triggerClassName="bg-transparent font-mono text-neutral-900 dark:text-white text-xs cursor-pointer hover:text-emerald-500 transition-colors focus:outline-none flex items-center gap-1"
             />
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
