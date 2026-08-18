import React, { useEffect, useRef, useState } from 'react';
import { useDAWStore, Track } from '../../store/dawStore';
import { Volume2, VolumeX } from 'lucide-react';
import { engine } from '../../lib/audioEngine';

import { useShallow } from 'zustand/react/shallow';

function MixerChannel({ track }: { track: Track, key?: React.Key }) {
  const updateTrack = useDAWStore(state => state.updateTrack);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     let animationFrameId: number;
     const updateMeter = () => {
         const meter = engine.getMeter(track.id);
         if (meter && meterRef.current) {
             const level = meter.getValue(); // Returns value in dbfs (-Infinity to 0)
             let db = Array.isArray(level) ? level[0] : level;
             if (!isFinite(db)) db = -100;
             // Map -60 to 0 to height 0% to 100%
             const heightPos = Math.max(0, Math.min(100, (db + 60) * (100 / 60)));
             meterRef.current.style.height = `${heightPos}%`;
         }
         animationFrameId = requestAnimationFrame(updateMeter);
     };
     updateMeter();
     return () => cancelAnimationFrame(animationFrameId);
  }, [track.id]);

  return (
    <div className="w-32 shrink-0 bg-neutral-200 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col items-center py-2 h-full">
      <div className="text-xs font-bold truncate w-full px-2 text-center text-neutral-600 dark:text-neutral-300 pointer-events-none mb-2">
        {track.name}
      </div>
      
      <div className="flex gap-1 mb-4">
        <button 
          aria-label={`Mute ${track.name}`}
          aria-pressed={track.isMuted}
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isMuted ? 'bg-orange-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}
          onClick={() => updateTrack(track.id, { isMuted: !track.isMuted })}
        >
          M
        </button>
        <button 
          aria-label={`Solo ${track.name}`}
          aria-pressed={track.isSolo}
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isSolo ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}
          onClick={() => updateTrack(track.id, { isSolo: !track.isSolo })}
        >
          S
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-end w-full relative group px-2 gap-2">
        <div className="flex flex-col w-full px-1 gap-1 mb-2">
          {/* FX Sends */}
          <div className="flex justify-between items-center text-[9px] text-emerald-600 border-none">
             <span>REV</span>
             <input type="range" min="0" max="1" step="0.05" value={track.reverb || 0} aria-label={`Reverb send ${track.name}`} aria-valuetext={`${Math.round((track.reverb || 0) * 100)}%`} onChange={(e) => updateTrack(track.id, { reverb: parseFloat(e.target.value) })} className="w-12 h-1 accent-emerald-500 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" />
          </div>
          <div className="flex justify-between items-center text-[9px] text-blue-500 mb-2 border-none">
             <span>DLY</span>
             <input type="range" min="0" max="1" step="0.05" value={track.delay || 0} aria-label={`Delay send ${track.name}`} aria-valuetext={`${Math.round((track.delay || 0) * 100)}%`} onChange={(e) => updateTrack(track.id, { delay: parseFloat(e.target.value) })} className="w-12 h-1 accent-blue-500 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" />
          </div>
          
          {/* Synth Env */}
          {track.type === 'midi' && track.env && (
             <div className="grid grid-cols-2 gap-x-1 gap-y-1 bg-black/10 dark:bg-black/30 p-1 rounded border-none">
                <div className="flex flex-col items-center border-none"><span className="text-[8px] text-neutral-500">A</span><input type="range" min="0.001" max="2" step="0.01" value={track.env.attack} aria-label={`Attack ${track.name}`} aria-valuetext={`${track.env.attack.toFixed(2)} seconds`} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, attack: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-neutral-500 dark:[&::-webkit-slider-thumb]:bg-neutral-300 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-neutral-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" /></div>
                <div className="flex flex-col items-center border-none"><span className="text-[8px] text-neutral-500">D</span><input type="range" min="0.01" max="2" step="0.01" value={track.env.decay} aria-label={`Decay ${track.name}`} aria-valuetext={`${track.env.decay.toFixed(2)} seconds`} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, decay: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-neutral-500 dark:[&::-webkit-slider-thumb]:bg-neutral-300 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-neutral-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" /></div>
                <div className="flex flex-col items-center border-none"><span className="text-[8px] text-neutral-500">S</span><input type="range" min="0" max="1" step="0.01" value={track.env.sustain} aria-label={`Sustain ${track.name}`} aria-valuetext={`${Math.round(track.env.sustain * 100)}%`} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, sustain: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-neutral-500 dark:[&::-webkit-slider-thumb]:bg-neutral-300 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-neutral-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" /></div>
                <div className="flex flex-col items-center border-none"><span className="text-[8px] text-neutral-500">R</span><input type="range" min="0.01" max="5" step="0.01" value={track.env.release} aria-label={`Release ${track.name}`} aria-valuetext={`${track.env.release.toFixed(2)} seconds`} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, release: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-neutral-500 dark:[&::-webkit-slider-thumb]:bg-neutral-300 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-neutral-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" /></div>
             </div>
          )}
        </div>
        
        <div className="flex-1 flex justify-center w-full relative min-h-[100px]">
            {/* Meter */}
            <div className="w-1.5 h-full bg-neutral-300 dark:bg-neutral-800 rounded overflow-hidden mr-6 flex flex-col justify-end">
               <div ref={meterRef} className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500" style={{ height: '0%' }} />
            </div>
            {/* Slider */}
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={track.volume}
              aria-label={`Volume ${track.name}`}
              aria-valuetext={`${Math.round(track.volume * 100)}%`}
              onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
              className="h-full hover:cursor-ns-resize accent-emerald-500 bg-neutral-200 dark:bg-neutral-800 rounded-full appearance-none w-1.5 absolute right-6 top-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-neutral-400 dark:[&::-webkit-slider-thumb]:border-neutral-600 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-neutral-400 dark:[&::-moz-range-thumb]:border-neutral-600 [&::-moz-range-thumb]:rounded-sm"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            />
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center w-full px-2">
         <span className="text-[10px] text-neutral-500 font-mono mb-1">PAN</span>
         <input 
            type="range" 
            min="-1" max="1" step="0.01" 
            value={track.pan}
            aria-label={`Pan ${track.name}`}
            aria-valuetext={track.pan === 0 ? 'Center' : track.pan < 0 ? `${Math.round(Math.abs(track.pan) * 100)}% Left` : `${Math.round(track.pan * 100)}% Right`}
            onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
            className="w-full accent-blue-500 h-1 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:rounded-full"
          />
      </div>
    </div>
  );
}

function MasterChannel() {
  const masterVolume = useDAWStore(state => state.masterVolume);
  const setMasterVolume = useDAWStore(state => state.setMasterVolume);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     let animationFrameId: number;
     const updateMeter = () => {
         if (meterRef.current) {
             const val = engine.masterMeter?.getValue() ?? -100;
             let height = 0;
             if (typeof val === 'number') {
                 height = val <= -60 ? 0 : ((val + 60) / 60) * 100;
             }
             meterRef.current.style.height = `${Math.min(100, Math.max(0, height))}%`;
         }
         animationFrameId = requestAnimationFrame(updateMeter);
     };
     updateMeter();
     return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="w-32 shrink-0 bg-neutral-200 dark:bg-neutral-900 border-l border-neutral-300 dark:border-neutral-800 flex flex-col items-center py-2 h-full shadow-[-4px_0_10px_rgba(0,0,0,0.1)] z-10 sticky right-0">
      <div className="text-xs font-bold truncate w-full px-2 text-center text-red-600 dark:text-red-500 pointer-events-none mb-2">
        MASTER
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-end w-full relative group px-2 gap-2 mt-[68px]">
        <div className="flex-1 flex justify-center w-full relative min-h-[100px]">
            {/* Meter */}
            <div className="w-1.5 h-full bg-neutral-300 dark:bg-neutral-800 rounded overflow-hidden mr-6 flex flex-col justify-end">
               <div ref={meterRef} className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500" style={{ height: '0%' }} />
            </div>
            {/* Slider */}
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={masterVolume}
              aria-label="Master Volume"
              aria-valuetext={`${Math.round(masterVolume * 100)}%`}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="h-full hover:cursor-ns-resize accent-red-500 bg-neutral-200 dark:bg-neutral-800 rounded-full appearance-none w-1.5 absolute right-6 top-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-neutral-400 dark:[&::-webkit-slider-thumb]:border-neutral-600 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-neutral-400 dark:[&::-moz-range-thumb]:border-neutral-600 [&::-moz-range-thumb]:rounded-sm"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            />
        </div>
      </div>

      <div aria-hidden="true" className="mt-4 h-[25px] w-full" />
    </div>
  );
}

export function Mixer() {

function RoutingControls() {
  const {
    tracks, buses, sends, addBus, updateBus, deleteBus, setTrackOutputBus,
    addSend, updateSend, deleteSend,
  } = useDAWStore(useShallow(state => ({
    tracks: state.tracks,
    buses: state.buses,
    sends: state.sends,
    addBus: state.addBus,
    updateBus: state.updateBus,
    deleteBus: state.deleteBus,
    setTrackOutputBus: state.setTrackOutputBus,
    addSend: state.addSend,
    updateSend: state.updateSend,
    deleteSend: state.deleteSend,
  })));
  const [busName, setBusName] = useState('');

  return (
    <section className="max-h-32 overflow-auto border-b border-neutral-300 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 p-2 text-[10px]" aria-label="Bus and send routing">
      <div className="flex items-center gap-2 mb-2">
        <strong>ROUTING</strong>
        <label className="sr-only" htmlFor="new-bus-name">New bus name</label>
        <input
          id="new-bus-name"
          value={busName}
          onChange={event => setBusName(event.target.value)}
          className="h-6 w-28 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1"
          placeholder="Group / FX bus"
        />
        <button
          type="button"
          className="h-6 rounded bg-emerald-600 px-2 text-white disabled:opacity-50"
          disabled={!busName.trim()}
          onClick={() => { addBus(busName); setBusName(''); }}
        >Add Bus</button>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <div className="space-y-1" aria-label="Track outputs">
          {tracks.map(track => (
            <div key={track.id} className="flex items-center gap-1">
              <span className="w-20 truncate" title={track.name}>{track.name}</span>
              <label className="sr-only" htmlFor={`output-${track.id}`}>Output bus for {track.name}</label>
              <select
                id={`output-${track.id}`}
                value={track.outputBusId ?? buses.find(bus => bus.outputBusId == null)?.id}
                onChange={event => setTrackOutputBus(track.id, event.target.value)}
                className="h-5 max-w-24 rounded bg-white dark:bg-neutral-800"
              >
                {buses.map(bus => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
              </select>
              <label className="sr-only" htmlFor={`send-${track.id}`}>Add send from {track.name}</label>
              <select
                id={`send-${track.id}`}
                value=""
                onChange={event => {
                  if (!event.target.value) return;
                  addSend({ sourceTrackId: track.id, targetBusId: event.target.value, gain: 0.5, preFader: false });
                }}
                className="h-5 max-w-24 rounded bg-white dark:bg-neutral-800"
              >
                <option value="">+ Send</option>
                {buses.map(bus => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="space-y-1" aria-label="Bus outputs">
          {buses.map(bus => (
            <div key={bus.id} className="flex items-center gap-1">
              <span className="w-20 truncate font-semibold" title={bus.name}>{bus.name}</span>
              {bus.outputBusId == null ? <span>Destination</span> : (
                <>
                  <label className="sr-only" htmlFor={`bus-output-${bus.id}`}>Output for {bus.name}</label>
                  <select
                    id={`bus-output-${bus.id}`}
                    value={bus.outputBusId}
                    onChange={event => updateBus(bus.id, { outputBusId: event.target.value })}
                    className="h-5 max-w-24 rounded bg-white dark:bg-neutral-800"
                  >
                    {buses.filter(candidate => candidate.id !== bus.id).map(candidate => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => deleteBus(bus.id)} aria-label={`Delete bus ${bus.name}`} className="text-red-500">×</button>
                </>
              )}
              <label className="sr-only" htmlFor={`bus-send-${bus.id}`}>Add send from {bus.name}</label>
              <select
                id={`bus-send-${bus.id}`}
                value=""
                onChange={event => {
                  if (!event.target.value) return;
                  addSend({ sourceBusId: bus.id, targetBusId: event.target.value, gain: 0.5, preFader: false });
                }}
                className="h-5 max-w-24 rounded bg-white dark:bg-neutral-800"
              >
                <option value="">+ Send</option>
                {buses.filter(candidate => candidate.id !== bus.id).map(candidate => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                ))}
              </select>
              <input type="range" min="0" max="1" step="0.01" value={bus.volume} aria-label={`Bus volume ${bus.name}`} onChange={event => updateBus(bus.id, { volume: Number(event.target.value) })} className="w-12" />
              <input type="range" min="-1" max="1" step="0.01" value={bus.pan} aria-label={`Bus pan ${bus.name}`} onChange={event => updateBus(bus.id, { pan: Number(event.target.value) })} className="w-12" />
              <button type="button" aria-label={`Mute ${bus.name}`} aria-pressed={bus.isMuted} onClick={() => updateBus(bus.id, { isMuted: !bus.isMuted })} className={bus.isMuted ? 'text-orange-500' : ''}>M</button>
              {(['reverb', 'delay', 'limiter'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  aria-label={`Add ${type} to ${bus.name}`}
                  onClick={() => updateBus(bus.id, { effects: [...bus.effects, {
                    id: `${type}-${crypto.randomUUID()}`,
                    type,
                    enabled: true,
                    parameters: type === 'reverb' ? { decay: 2 } : type === 'delay' ? { delayTime: 0.25, feedback: 0.3 } : { threshold: -1 },
                  }] })}
                  className="rounded bg-neutral-300 dark:bg-neutral-700 px-1"
                >+{type[0].toUpperCase()}</button>
              ))}
              {bus.effects.map(effect => (
                <span key={effect.id} className="inline-flex">
                  <button
                    type="button"
                    aria-pressed={effect.enabled}
                    aria-label={`${effect.enabled ? 'Disable' : 'Enable'} ${effect.type} on ${bus.name}`}
                    onClick={() => updateBus(bus.id, { effects: bus.effects.map(item => item.id === effect.id ? { ...item, enabled: !item.enabled } : item) })}
                    className={effect.enabled ? 'text-emerald-500' : 'text-neutral-500'}
                  >{effect.type[0].toUpperCase()}</button>
                  <button type="button" aria-label={`Remove ${effect.type} from ${bus.name}`} onClick={() => updateBus(bus.id, { effects: bus.effects.filter(item => item.id !== effect.id) })}>×</button>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {sends.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Active sends">
          {sends.map(send => {
            const source = send.sourceTrackId
              ? tracks.find(track => track.id === send.sourceTrackId)?.name
              : buses.find(bus => bus.id === send.sourceBusId)?.name;
            const target = buses.find(bus => bus.id === send.targetBusId)?.name;
            return (
              <div key={send.id} className="flex items-center gap-1 rounded bg-neutral-200 dark:bg-neutral-800 px-1">
                <span>{source} → {target}</span>
                <input
                  type="range" min="0" max="1" step="0.01" value={send.gain}
                  aria-label={`Send gain ${source} to ${target}`}
                  onChange={event => updateSend(send.id, { gain: Number(event.target.value) })}
                  className="w-16"
                />
                <label><input type="checkbox" checked={send.preFader} onChange={event => updateSend(send.id, { preFader: event.target.checked })} /> Pre</label>
                <button type="button" onClick={() => deleteSend(send.id)} aria-label={`Delete send ${source} to ${target}`} className="text-red-500">×</button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
  const { tracks, bottomPanel, setBottomPanel, panelHeight, panelFullScreen, setPanelHeight, setPanelFullScreen } = useDAWStore(useShallow(state => ({
      tracks: state.tracks,
      bottomPanel: state.bottomPanel,
      setBottomPanel: state.setBottomPanel,
      panelHeight: state.panelHeight,
      panelFullScreen: state.panelFullScreen,
      setPanelHeight: state.setPanelHeight,
      setPanelFullScreen: state.setPanelFullScreen
  })));
  
  return (
    <div 
        className={`${panelFullScreen ? 'absolute inset-x-0 bottom-0 top-[3.5rem] z-50' : 'relative'} bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800 flex flex-col select-none`}
        style={!panelFullScreen ? { height: panelHeight } : undefined}
    >
      {!panelFullScreen && (
          <div 
              className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-emerald-500/50 z-20"
              onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const startY = e.clientY;
                  const startHeight = panelHeight;
                  const onMove = (m: PointerEvent) => {
                      setPanelHeight(Math.max(150, Math.min(800, startHeight + (startY - m.clientY))));
                  };
                  const onUp = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
              }}
          />
      )}
      <div className="h-8 bg-neutral-200/80 dark:bg-neutral-800/80 border-b border-neutral-300 dark:border-neutral-800 flex items-center px-4 justify-between shrink-0">
        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">MIXER</span>
        <div className="flex items-center gap-2">
            <button 
              onClick={() => setPanelFullScreen(!panelFullScreen)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              {panelFullScreen ? '↙' : '↗'}
            </button>
            <button 
              onClick={() => setBottomPanel(null)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white mb-1 leading-none text-lg font-mono font-bold ml-2"
            >
              &times;
            </button>
        </div>
      </div>
      <RoutingControls />
      <div className="flex flex-1 overflow-x-auto custom-scrollbar bg-neutral-50 dark:bg-neutral-950 pr-4">
         {tracks.map(track => (
           <MixerChannel key={track.id} track={track} />
         ))}
         <MasterChannel />
      </div>
    </div>
  );
}
