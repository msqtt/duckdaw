import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Play, Square, Circle, Settings2, Download, Mic, LayoutGrid, Sliders, Undo2, Redo2, Repeat, Bell, ChevronDown, Timer, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDAWStore, useTemporalStore } from '../../store/dawStore';
import { engine } from '../../lib/audioEngine';
import { Dropdown } from '../ui/Dropdown';
import { MasterVisualizer } from './MasterVisualizer';
import { createNewProject, deleteTemplate, saveProject, openProject, getRecentProjects, openRecentProject, RecentProject, saveAsTemplate, getTemplates, openTemplate, ProjectTemplate } from '../../lib/projectStorage';
import { requestDecision } from '../../lib/decisionService';
import toast from 'react-hot-toast';

import { useShallow } from 'zustand/react/shallow';

const SettingsModal = React.lazy(() => import('./SettingsModal').then(module => ({ default: module.SettingsModal })));
const TempoMapEditor = React.lazy(() => import('./TempoMapEditor').then(module => ({ default: module.TempoMapEditor })));
const AutomationPanel = React.lazy(() => import('./AutomationPanel').then(module => ({ default: module.AutomationPanel })));

export function TopBar() {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);

  useEffect(() => {
    getRecentProjects().then(setRecentProjects).catch(error => toast.error(`Failed to load recent projects: ${error instanceof Error ? error.message : String(error)}`));
    getTemplates().then(setTemplates).catch(error => toast.error(`Failed to load templates: ${error instanceof Error ? error.message : String(error)}`));
  }, []);

  const { projectName, tracks, selectedTrackId, isDirty, isPlaying, isRecording, isMicRecording, toggleMicRecording, togglePlay, stop, toggleRecording, bpm, setBpm, timeSignature, setTimeSignature, snapToGrid, setSnapToGrid, bottomPanel, setBottomPanel, theme, toggleTheme, setExportModalOpen, isLooping, toggleLoop, metronomeOn, toggleMetronome, arrangements, activeArrangementId, setArrangement, addArrangement, deleteArrangement } = useDAWStore(useShallow(state => ({
      projectName: state.projectName,
      tracks: state.tracks,
      selectedTrackId: state.selectedTrackId,
      isDirty: state.isDirty,
      isPlaying: state.isPlaying,
      isRecording: state.isRecording,
      isMicRecording: state.isMicRecording,
      toggleMicRecording: state.toggleMicRecording,
      togglePlay: state.togglePlay,
      stop: state.stop,
      toggleRecording: state.toggleRecording,
      bpm: state.bpm,
      setBpm: state.setBpm,
      timeSignature: state.timeSignature,
      setTimeSignature: state.setTimeSignature,
      snapToGrid: state.snapToGrid,
      setSnapToGrid: state.setSnapToGrid,
      bottomPanel: state.bottomPanel,
      setBottomPanel: state.setBottomPanel,
      theme: state.theme,
      toggleTheme: state.toggleTheme,
      setExportModalOpen: state.setExportModalOpen,
      isLooping: state.isLooping,
      toggleLoop: state.toggleLoop,
      metronomeOn: state.metronomeOn,
      toggleMetronome: state.toggleMetronome,
      arrangements: state.arrangements,
      activeArrangementId: state.activeArrangementId,
      setArrangement: state.setArrangement,
      addArrangement: state.addArrangement,
      deleteArrangement: state.deleteArrangement
  })));

  const selectedTrack = tracks.find(track => track.id === selectedTrackId);
  const canRecordMidi = selectedTrack?.type === 'midi';
  const canRecordMic = selectedTrack?.type === 'audio';
  const { undo, redo, pastStates, futureStates } = useTemporalStore((state) => state);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showMetronomeMenu, setShowMetronomeMenu] = useState(false);
  const [showTempoMap, setShowTempoMap] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const metronomeRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
        if (metronomeRef.current && !metronomeRef.current.contains(e.target as Node)) {
             setShowMetronomeMenu(false);
        }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

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
             const seconds = Math.floor(parseFloat(parts[1]));
             const milliseconds = Math.floor(parseFloat(parts[2]));
             setCurrentTime(`${parts[0]}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`);
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
        <div className="flex items-center gap-4">
          <Dropdown
            ariaLabel="Project menu"
            align="left"
            options={[
              { value: 'new', label: 'New Project (Reset)' },
              { value: 'open', label: 'Open... (Ctrl+O)' },
              { value: 'save', label: 'Save (Ctrl+S)' },
              { value: 'save_as', label: 'Save As... (Ctrl+Shift+S)' },
              { value: 'save_template', label: 'Save as Template...' },
              ...(templates.length > 0 ? [{ value: 'divider_tpl', label: '--- Templates ---' }] : []),
              ...templates.map((tpl, i) => ({
                value: `template_${i}`,
                label: `New from: ${tpl.name}`,
              })),
              ...templates.map((tpl, i) => ({
                value: `delete_template_${i}`,
                label: `Delete template: ${tpl.name}`,
              })),
              ...(recentProjects.length > 0 ? [{ value: 'divider_recent', label: '--- Recent Projects ---' }] : []),
              ...recentProjects.map((rp, i) => ({
                value: `recent_${i}`,
                label: rp.name,
              }))
            ]}
            onChange={async (val) => {
              if (val === 'divider_recent' || val === 'divider_tpl') return;
              if (typeof val === 'string' && val.startsWith('delete_template_')) {
                const idx = parseInt(val.replace('delete_template_', ''), 10);
                await deleteTemplate(idx);
                setTemplates(await getTemplates());
                toast.success('Template deleted');
                return;
              }
              if (typeof val === 'string' && val.startsWith('template_')) {
                const idx = parseInt(val.replace('template_', ''), 10);
                const tpl = templates[idx];
                if (tpl) {
                  try {
                    await openTemplate(tpl.data);
                    toast.success(`Created project from ${tpl.name}`);
                  } catch (e: any) {
                    toast.error(`Failed to load template: ${e.message}`);
                  }
                }
                return;
              }
              if (val === 'save_template') {
                 const decision = await requestDecision({
                   title: 'Save as template',
                   message: 'Choose a name for this structure-only template.',
                   input: { label: 'Template name', placeholder: 'My Template' },
                   options: [
                     { id: 'cancel', label: 'Cancel', kind: 'secondary' },
                     { id: 'save', label: 'Save template', kind: 'primary', requiresValue: true },
                   ],
                 });
                 const name = decision?.choice === 'save' ? decision.value : undefined;
                 if (name) {
                    try {
                        await saveAsTemplate(name, "User saved template.");
                        toast.success("Template saved!");
                        // Refresh templates
                        getTemplates().then(setTemplates);
                    } catch (e: any) {
                        toast.error(`Failed to save template: ${e.message}`);
                    }
                 }
                 return;
              }
              if (typeof val === 'string' && val.startsWith('recent_')) {
                const idx = parseInt(val.replace('recent_', ''), 10);
                const rp = recentProjects[idx];
                if (rp) {
                  try {
                    await openRecentProject(rp.handle);
                    toast.success('Recent project loaded');
                  } catch (e: any) {
                    toast.error(`Failed to load: ${e.message}`);
                  }
                }
                return;
              }
              if (val === 'save') {
                try {
                  const result = await saveProject(false);
                  if (result === 'saved' || result === 'downloaded') toast.success('Project saved');
                } catch (e: any) {
                  toast.error(e.message);
                }
              } else if (val === 'save_as') {
                try {
                  const result = await saveProject(true);
                  if (result === 'saved' || result === 'downloaded') toast.success('Project saved as new file');
                } catch (e: any) {
                  toast.error(e.message);
                }
              } else if (val === 'open') {
                try {
                  const opened = await openProject();
                  if (opened) toast.success('Project loaded');
                } catch (e: any) {
                  toast.error(e.message);
                }
              } else if (val === 'new') {
                if (await createNewProject()) {
                  toast.success('New project created');
                }
              }
            }}
            trigger={
              <div className="flex items-center gap-1 hover:opacity-80 py-1 transition-opacity">
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-widest flex items-center gap-2 m-0 p-0">
                  🦆 Duck<span className="text-emerald-600 dark:text-emerald-500">DAW</span>
                </h1>
                <ChevronDown size={14} className="ml-1 opacity-50" />
              </div>
            }
          />
          <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700 mx-2" />
          <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 cursor-default">
            {projectName}
            {isDirty && <span className="text-emerald-500 ml-1 font-bold">*</span>}
          </div>
          <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700 mx-1" />
          <Dropdown
            ariaLabel="Arrangement"
            align="left"
            options={[
              ...arrangements.map(a => ({ value: a.id, label: a.name })),
              { value: 'divider', label: '---' },
              { value: 'new', label: 'New Arrangement...' },
              ...(arrangements.length > 1 ? [{ value: 'delete_current', label: 'Delete Current Arrangement' }] : [])
            ]}
            value={activeArrangementId || undefined}
            onChange={async (val) => {
              if (val === 'divider') return;
              if (val === 'delete_current') {
                if (!activeArrangementId) return;
                const decision = await requestDecision({
                  title: 'Delete arrangement?',
                  message: 'The current arrangement and all clips that belong to it will be deleted.',
                  options: [
                    { id: 'cancel', label: 'Cancel', kind: 'secondary' },
                    { id: 'delete', label: 'Delete arrangement', kind: 'danger' },
                  ],
                });
                if (decision?.choice === 'delete') deleteArrangement(activeArrangementId);
                return;
              }
              if (val === 'new') {
                const decision = await requestDecision({
                  title: 'New arrangement',
                  message: 'Create an empty arrangement or copy all clips from the current arrangement.',
                  input: {
                    label: 'Arrangement name',
                    defaultValue: `Arrangement ${arrangements.length + 1}`,
                  },
                  options: [
                    { id: 'cancel', label: 'Cancel', kind: 'secondary' },
                    { id: 'empty', label: 'Create empty', kind: 'secondary', requiresValue: true },
                    { id: 'copy', label: 'Copy current', kind: 'primary', requiresValue: true },
                  ],
                });
                if (decision && decision.choice !== 'cancel' && decision.value) {
                  addArrangement(decision.value, decision.choice === 'copy');
                }
              } else {
                setArrangement(val);
              }
            }}
            trigger={
              <div className="flex items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-xs font-semibold cursor-pointer">
                <span>{arrangements.find(a => a.id === activeArrangementId)?.name || 'Scene'}</span>
                <ChevronDown size={12} className="opacity-70" />
              </div>
            }
          />
        </div>
        
        {/* Transport Controls */}
        <div className="flex items-center gap-1 bg-neutral-200 dark:bg-neutral-800 rounded-md p-1">
          <button 
            className="p-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={() => undo()}
            disabled={pastStates.length === 0}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={18} />
          </button>
          <button 
            className="p-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={() => redo()}
            disabled={futureStates.length === 0}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={18} />
          </button>
          
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700 mx-1" />
          
          <button 
            className="p-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors"
            aria-label="Stop"
            onClick={handleStop}
          >
            <Square size={20} className="fill-neutral-600 dark:fill-neutral-300" />
          </button>
          <button 
            className={`p-2 rounded transition-colors ${isPlaying ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={handlePlay}
          >
            <Play size={20} className={isPlaying ? 'fill-emerald-600 dark:fill-emerald-500' : 'fill-neutral-600 dark:fill-neutral-300'} />
          </button>
          <button 
            className={`p-2 rounded transition-colors ${isRecording ? 'bg-red-500/20 text-red-600 dark:text-red-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'} disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={toggleRecording}
            disabled={!isRecording && !canRecordMidi}
            title={isRecording ? 'Stop MIDI recording' : canRecordMidi ? 'Record MIDI on selected track' : 'Select a MIDI track to record'}
            aria-label={isRecording ? 'Stop MIDI recording' : 'Start MIDI recording'}
          >
            <Circle size={20} className={isRecording ? 'fill-red-600 dark:fill-red-500' : 'fill-neutral-600 dark:fill-neutral-300'} />
          </button>
          <button 
            className={`p-2 rounded transition-colors ${isMicRecording ? 'bg-red-500/20 text-red-600 dark:text-red-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'} disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={handleMicRecord}
            disabled={!isMicRecording && !canRecordMic}
            title={isMicRecording ? 'Stop microphone recording' : canRecordMic ? 'Record microphone on selected track' : 'Select an audio track to record'}
            aria-label={isMicRecording ? 'Stop microphone recording' : 'Start microphone recording'}
          >
            <Mic size={20} className={isMicRecording ? 'stroke-red-600 dark:stroke-red-500 fill-red-600/20 dark:fill-red-500/20' : 'fill-neutral-600 dark:fill-neutral-300'} />
          </button>
          
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700 mx-1" />
          
          <button 
            className={`p-2 rounded transition-colors ${isLooping ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
            onClick={toggleLoop}
            title="Cycle Mode"
            aria-label="Toggle cycle mode"
          >
            <Repeat size={18} />
          </button>
          <div 
             className="relative"
             ref={metronomeRef}
             onContextMenu={(e) => {
                e.preventDefault();
                setShowMetronomeMenu(!showMetronomeMenu);
             }}
          >
            <button 
              className={`p-2 rounded transition-colors ${metronomeOn ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}
              onClick={toggleMetronome}
              title="Metronome (Right click for settings)"
              aria-label="Toggle metronome"
            >
              <Bell size={18} />
            </button>
            <AnimatePresence>
              {showMetronomeMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute z-50 top-full mt-2 right-0 w-64 bg-white dark:bg-neutral-800 rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-3 space-y-3 cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-neutral-500">Sound</span>
                    <Dropdown 
                      options={[
                        { value: 'cute', label: 'Cute (Boop)' },
                        { value: 'click', label: 'Click' },
                        { value: 'woodblock', label: 'Woodblock' },
                        { value: 'electronic', label: 'Electronic' }
                      ]}
                      value={useDAWStore.getState().metronomeSound}
                      onChange={(val) => useDAWStore.getState().setMetronomeSound(val as any)}
                      triggerClassName="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 outline-none text-xs hover:border-emerald-500 transition-colors cursor-pointer"
                      align="right"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-neutral-500">Subdivisions</span>
                    <Dropdown 
                      options={[
                        { value: 1, label: 'Quarter (1x)' },
                        { value: 2, label: 'Eighth (2x)' },
                        { value: 4, label: 'Sixteenth (4x)' }
                      ]}
                      value={useDAWStore.getState().metronomeSubdivisions}
                      onChange={(val) => useDAWStore.getState().setMetronomeSubdivisions(parseInt(val as string))}
                      triggerClassName="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 outline-none text-xs hover:border-emerald-500 transition-colors cursor-pointer"
                      align="right"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase text-neutral-500">
                       <span>Volume</span>
                       <span>{Math.round(useDAWStore.getState().metronomeVolume * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.01" 
                      value={useDAWStore.getState().metronomeVolume}
                      aria-label="Metronome volume"
                      aria-valuetext={`${Math.round(useDAWStore.getState().metronomeVolume * 100)}%`}
                      onChange={(e) => useDAWStore.getState().setMetronomeVolume(parseFloat(e.target.value))}
                      className="w-full h-1 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:rounded-full"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-neutral-200 dark:bg-neutral-800 rounded-md px-3 py-1.5 h-10">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-neutral-500 font-bold">BPM</span>
            <input 
               className="font-mono text-emerald-600 dark:text-emerald-500 font-bold text-lg bg-transparent w-12 outline-none"
               aria-label="Tempo BPM"
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
                type="button"
                className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded transition-colors ${snapToGrid ? 'text-emerald-500 bg-emerald-500/10' : 'text-neutral-500 bg-neutral-500/10'}`}
                title="Toggle grid snapping"
                aria-label="Toggle grid snapping"
                onClick={() => setSnapToGrid(!snapToGrid)}
             >
                 Grid
             </button>
             <Dropdown
               options={gridSnapOptions}
               value={useDAWStore.getState().snapGridSize}
               onChange={(val) => useDAWStore.getState().setSnapGridSize(parseFloat(val))}
               triggerClassName="bg-transparent font-mono text-neutral-900 dark:text-white text-xs cursor-pointer hover:text-emerald-500 transition-colors focus:outline-none flex items-center gap-1"
             />
          </div>
          <div className="w-px h-6 bg-neutral-400 dark:bg-neutral-700" />
          <div data-testid="transport-time" className="font-mono w-20 text-center text-sm font-semibold tracking-wider tabular-nums">
             {currentTime}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Visualizer */}
        <MasterVisualizer />

        {/* Panel Toggles */}
        <div className="flex items-center bg-neutral-200 dark:bg-neutral-800 rounded-md p-1 mr-2">
            <button 
                title="Toggle Piano Roll"
                aria-label="Toggle piano roll"
                className={`p-1.5 rounded transition-colors ${bottomPanel === 'piano-roll' ? 'bg-neutral-400 dark:bg-neutral-600 text-neutral-900 dark:text-white' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                onClick={() => setBottomPanel(bottomPanel === 'piano-roll' ? null : 'piano-roll')}
            >
                <LayoutGrid size={18} />
            </button>
            <button 
                title="Toggle Mixer"
                aria-label="Toggle mixer"
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
          type="button"
          className={`p-1.5 rounded transition-colors ${showTempoMap ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
          title="Tempo Map"
          aria-label="Toggle tempo map editor"
          aria-pressed={showTempoMap}
          onClick={() => setShowTempoMap(v => !v)}
        >
          <Timer size={18} />
        </button>
        <button
          type="button"
          className={`p-1.5 rounded transition-colors ${showAutomation ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
          title="Automation"
          aria-label="Toggle automation panel"
          aria-pressed={showAutomation}
          onClick={() => setShowAutomation(v => !v)}
        >
          <Zap size={18} />
        </button>
        <button 
          aria-label="Settings"
          className="p-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors"
          onClick={() => setShowSettings(true)}
        >
          <Settings2 size={20} />
        </button>
      </div>
      <React.Suspense fallback={null}>
        {showTempoMap && (
          <div className="absolute right-4 top-16 z-50 w-72">
            <TempoMapEditor onClose={() => setShowTempoMap(false)} />
          </div>
        )}
        {showAutomation && (
          <div className="absolute right-4 top-16 z-50 w-80">
            <AutomationPanel onClose={() => setShowAutomation(false)} />
          </div>
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </React.Suspense>
    </div>
  );
}
