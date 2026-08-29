import React, { useEffect, useRef } from 'react';
import { useDAWStore, Track } from '../../store/dawStore';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { engine } from '../../lib/audioEngine';
import { useShallow } from 'zustand/react/shallow';
import { createPluginDescriptor, type PluginInstanceDescriptor } from '../../lib/pluginSdk';
import { getDefaultPluginRegistry } from '../../lib/pluginRuntime';
import { movePluginInChain } from '../../lib/pluginUi';
import { usePluginInspectorStore } from '../../store/pluginInspectorStore';
import { AutomationCreateButton } from './AutomationCreateButton';
import { RoutingGraph } from './RoutingGraph';

const pluginRegistry = getDefaultPluginRegistry();
const effectDefinitions = pluginRegistry.list('effect');

function PluginChainEditor({
  ownerType,
  ownerId,
  ownerName,
  plugins,
  onChange,
}: {
  ownerType: 'track' | 'bus';
  ownerId: string;
  ownerName: string;
  plugins: PluginInstanceDescriptor[];
  onChange: (plugins: PluginInstanceDescriptor[]) => void;
}) {
  const inspectorTarget = usePluginInspectorStore(state => state.target);
  const openInspector = usePluginInspectorStore(state => state.open);
  const closeInspector = usePluginInspectorStore(state => state.close);
  const controlId = `add-effect-${ownerType}-${ownerId}`;

  return (
    <div className="w-full space-y-1 rounded bg-black/5 dark:bg-black/20 p-1" data-testid="plugin-chain">
      <label className="sr-only" htmlFor={controlId}>Add effect to {ownerName}</label>
      <select
        id={controlId}
        aria-label={`Add effect to ${ownerName}`}
        value=""
        onChange={event => {
          const definition = pluginRegistry.get(event.target.value);
          if (definition?.kind !== 'effect') return;
          const descriptor = createPluginDescriptor(definition);
          onChange([...plugins, descriptor]);
          openInspector({ ownerType, ownerId, kind: 'effect', pluginInstanceId: descriptor.id });
        }}
        className="h-6 w-full rounded bg-white dark:bg-neutral-800 text-[9px]"
      >
        <option value="">+ Effect</option>
        {effectDefinitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
      </select>
      {plugins.map((plugin, index) => {
        const definition = pluginRegistry.get(plugin.pluginId);
        const available = definition?.kind === 'effect';
        const label = available ? definition.name : `Unavailable: ${plugin.pluginId}`;
        return (
          <div
            key={plugin.id}
            data-testid="plugin-chain-item"
            data-plugin-id={plugin.pluginId}
            data-plugin-instance-id={plugin.id}
            className="flex items-center gap-0.5 rounded border border-neutral-300 bg-white/50 p-0.5 text-[8px] dark:border-neutral-700 dark:bg-neutral-900/50"
          >
            <button
              type="button"
              aria-label={`Open ${label} details on ${ownerName}`}
              onClick={() => openInspector({ ownerType, ownerId, kind: 'effect', pluginInstanceId: plugin.id })}
              className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left ${plugin.enabled ? 'text-emerald-600' : 'text-neutral-500'}`}
              title={label}
            >{index + 1}. {label}</button>
            <button
              type="button"
              aria-pressed={plugin.enabled}
              aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.pluginId} on ${ownerName}`}
              onClick={() => onChange(plugins.map(item => item.id === plugin.id ? { ...item, enabled: !item.enabled } : item))}
              className="rounded px-1 font-bold"
            >{plugin.enabled ? '●' : '○'}</button>
            <button
              type="button"
              aria-label={`Move ${label} up on ${ownerName}`}
              disabled={index === 0}
              onClick={() => {
                const moved = movePluginInChain(plugins, plugin.id, 'up');
                if (moved !== plugins) onChange([...moved]);
              }}
              className="rounded p-0.5 disabled:opacity-25"
            ><ChevronUp size={11} /></button>
            <button
              type="button"
              aria-label={`Move ${label} down on ${ownerName}`}
              disabled={index === plugins.length - 1}
              onClick={() => {
                const moved = movePluginInChain(plugins, plugin.id, 'down');
                if (moved !== plugins) onChange([...moved]);
              }}
              className="rounded p-0.5 disabled:opacity-25"
            ><ChevronDown size={11} /></button>
            <button
              type="button"
              aria-label={`Remove ${plugin.pluginId} from ${ownerName}`}
              onClick={() => {
                onChange(plugins.filter(item => item.id !== plugin.id));
                if (inspectorTarget?.kind === 'effect' && inspectorTarget.ownerType === ownerType
                  && inspectorTarget.ownerId === ownerId && inspectorTarget.pluginInstanceId === plugin.id) closeInspector();
              }}
              className="rounded p-0.5 text-neutral-500 hover:text-red-500"
            ><X size={11} /></button>
          </div>
        );
      })}
    </div>
  );
}

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
    <div data-testid="mixer-channel" data-track-id={track.id} className="w-32 shrink-0 bg-neutral-200 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col items-center py-2 h-full">
      <div className="text-xs font-bold truncate w-full px-2 text-center text-neutral-600 dark:text-neutral-300 pointer-events-none mb-2">
        {track.name}
      </div>
      
      <div className="w-full px-2 mb-2">
        <PluginChainEditor
          ownerType="track"
          ownerId={track.id}
          ownerName={track.name}
          plugins={track.effectPlugins ?? []}
          onChange={effectPlugins => updateTrack(track.id, { effectPlugins })}
        />
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
        <AutomationCreateButton trackId={track.id} trackName={track.name} binding={{ target: 'track.mute', label: 'Mute', range: { min: 0, max: 1 }, valueType: 'discrete' }} currentValue={track.isMuted ? 1 : 0} />
        <button 
          aria-label={`Solo ${track.name}`}
          aria-pressed={track.isSolo}
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isSolo ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}
          onClick={() => updateTrack(track.id, { isSolo: !track.isSolo })}
        >
          S
        </button>
        <AutomationCreateButton trackId={track.id} trackName={track.name} binding={{ target: 'track.solo', label: 'Solo', range: { min: 0, max: 1 }, valueType: 'discrete' }} currentValue={track.isSolo ? 1 : 0} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-end w-full relative group px-2 gap-2">
        <div className="flex flex-col w-full px-1 gap-1 mb-2">
          {/* FX Sends */}
          <div className="flex justify-between items-center text-[9px] text-emerald-600 border-none">
             <span>REV</span>
             <AutomationCreateButton trackId={track.id} trackName={track.name} binding={{ target: 'reverb', label: 'Reverb', range: { min: 0, max: 1 }, valueType: 'continuous' }} currentValue={track.reverb || 0} />
             <input type="range" min="0" max="1" step="0.05" value={track.reverb || 0} aria-label={`Reverb send ${track.name}`} aria-valuetext={`${Math.round((track.reverb || 0) * 100)}%`} onChange={(e) => updateTrack(track.id, { reverb: parseFloat(e.target.value) })} className="w-12 h-1 accent-emerald-500 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" />
          </div>
          <div className="flex justify-between items-center text-[9px] text-blue-500 mb-2 border-none">
             <span>DLY</span>
             <AutomationCreateButton trackId={track.id} trackName={track.name} binding={{ target: 'delay', label: 'Delay', range: { min: 0, max: 1 }, valueType: 'continuous' }} currentValue={track.delay || 0} />
             <input type="range" min="0" max="1" step="0.05" value={track.delay || 0} aria-label={`Delay send ${track.name}`} aria-valuetext={`${Math.round((track.delay || 0) * 100)}%`} onChange={(e) => updateTrack(track.id, { delay: parseFloat(e.target.value) })} className="w-12 h-1 accent-blue-500 bg-neutral-200 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full" />
          </div>
          
        </div>
        
        <div className="flex-1 flex justify-center w-full relative min-h-[100px]">
            <AutomationCreateButton className="absolute left-0 top-0 z-10" trackId={track.id} trackName={track.name} binding={{ target: 'volume', label: 'Volume', range: { min: 0, max: 1 }, valueType: 'continuous' }} currentValue={track.volume} />
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
         <AutomationCreateButton trackId={track.id} trackName={track.name} binding={{ target: 'pan', label: 'Pan', range: { min: -1, max: 1 }, valueType: 'continuous' }} currentValue={track.pan} />
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

function BusMixerChannel({ bus }: { bus: import('../../lib/routingGraph').Bus; key?: React.Key }) {
  const updateBus = useDAWStore(state => state.updateBus);
  const deleteBus = useDAWStore(state => state.deleteBus);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId = 0;
    const updateMeter = () => {
      const level = engine.getBusMeter(bus.id)?.getValue();
      const dbValue = Array.isArray(level) ? level[0] : level;
      const db = typeof dbValue === 'number' && Number.isFinite(dbValue) ? dbValue : -100;
      if (meterRef.current) meterRef.current.style.height = `${Math.max(0, Math.min(100, (db + 60) * (100 / 60)))}%`;
      animationFrameId = requestAnimationFrame(updateMeter);
    };
    updateMeter();
    return () => cancelAnimationFrame(animationFrameId);
  }, [bus.id]);

  return (
    <div data-testid="bus-mixer-channel" data-bus-id={bus.id} className="flex h-full w-32 shrink-0 flex-col items-center border-r border-violet-500/30 bg-violet-50/40 py-2 dark:bg-violet-950/10">
      <div className="mb-2 flex w-full items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-center text-xs font-bold text-violet-600" title={bus.name}>{bus.name}</span>
        <button type="button" aria-label={`Delete bus ${bus.name}`} onClick={() => deleteBus(bus.id)} className="text-neutral-400 hover:text-red-500">×</button>
      </div>
      <div className="mb-2 w-full px-2">
        <PluginChainEditor ownerType="bus" ownerId={bus.id} ownerName={bus.name} plugins={bus.effectPlugins ?? []} onChange={effectPlugins => updateBus(bus.id, { effectPlugins })} />
      </div>
      <button type="button" aria-label={`Mute ${bus.name}`} aria-pressed={bus.isMuted} onClick={() => updateBus(bus.id, { isMuted: !bus.isMuted })} className={`mb-3 h-6 w-8 rounded text-xs font-bold ${bus.isMuted ? 'bg-orange-500 text-white' : 'bg-neutral-300 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'}`}>M</button>
      <div className="relative flex min-h-[100px] flex-1 justify-center gap-5">
        <div className="flex h-full w-1.5 flex-col justify-end overflow-hidden rounded bg-neutral-300 dark:bg-neutral-800"><div ref={meterRef} data-testid="bus-meter-level" data-bus-id={bus.id} className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500" style={{ height: '0%' }} /></div>
        <input type="range" min="0" max="1" step="0.01" value={bus.volume} aria-label={`Bus volume ${bus.name}`} aria-valuetext={`${Math.round(bus.volume * 100)}%`} onChange={event => updateBus(bus.id, { volume: Number(event.target.value) })} className="h-full w-1.5 accent-violet-500" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} />
      </div>
      <div className="mt-3 w-full px-2 text-center text-[9px] text-neutral-500">PAN</div>
      <input type="range" min="-1" max="1" step="0.01" value={bus.pan} aria-label={`Bus pan ${bus.name}`} aria-valuetext={bus.pan === 0 ? 'Center' : `${Math.round(bus.pan * 100)}`} onChange={event => updateBus(bus.id, { pan: Number(event.target.value) })} className="mx-2 w-24 accent-violet-500" />
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

function RoutingControls() { return <RoutingGraph />; }
  const { tracks, buses, setBottomPanel, panelHeight, panelFullScreen, setPanelHeight, setPanelFullScreen } = useDAWStore(useShallow(state => ({
      tracks: state.tracks,
      buses: state.buses,
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
              aria-label={panelFullScreen ? 'Exit full screen mixer' : 'Full screen mixer'}
              onClick={() => setPanelFullScreen(!panelFullScreen)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              {panelFullScreen ? '↙' : '↗'}
            </button>
            <button 
              aria-label="Close mixer"
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
         {buses.filter(bus => bus.outputBusId != null).map(bus => (
           <BusMixerChannel key={bus.id} bus={bus} />
         ))}
         <MasterChannel />
      </div>
    </div>
  );
}
