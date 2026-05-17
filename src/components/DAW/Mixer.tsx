import React, { useEffect, useRef } from 'react';
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
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isMuted ? 'bg-orange-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}
          onClick={() => updateTrack(track.id, { isMuted: !track.isMuted })}
        >
          M
        </button>
        <button 
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isSolo ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}
          onClick={() => updateTrack(track.id, { isSolo: !track.isSolo })}
        >
          S
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-end w-full relative group px-2 gap-2">
        <div className="flex flex-col w-full px-1 gap-1 mb-2">
          {/* FX Sends */}
          <div className="flex justify-between items-center text-[9px] text-emerald-600">
             <span>REV</span>
             <input type="range" min="0" max="1" step="0.05" value={track.reverb || 0} onChange={(e) => updateTrack(track.id, { reverb: parseFloat(e.target.value) })} className="w-12 h-1 accent-emerald-500 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize" />
          </div>
          <div className="flex justify-between items-center text-[9px] text-blue-500 mb-2">
             <span>DLY</span>
             <input type="range" min="0" max="1" step="0.05" value={track.delay || 0} onChange={(e) => updateTrack(track.id, { delay: parseFloat(e.target.value) })} className="w-12 h-1 accent-blue-500 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize" />
          </div>
          
          {/* Synth Env */}
          {track.type === 'midi' && track.env && (
             <div className="grid grid-cols-2 gap-x-1 gap-y-1 bg-black/10 dark:bg-black/30 p-1 rounded">
                <div className="flex flex-col items-center"><span className="text-[8px] text-neutral-500">A</span><input type="range" min="0.001" max="2" step="0.01" value={track.env.attack} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, attack: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize" /></div>
                <div className="flex flex-col items-center"><span className="text-[8px] text-neutral-500">D</span><input type="range" min="0.01" max="2" step="0.01" value={track.env.decay} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, decay: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize" /></div>
                <div className="flex flex-col items-center"><span className="text-[8px] text-neutral-500">S</span><input type="range" min="0" max="1" step="0.01" value={track.env.sustain} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, sustain: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize" /></div>
                <div className="flex flex-col items-center"><span className="text-[8px] text-neutral-500">R</span><input type="range" min="0.01" max="5" step="0.01" value={track.env.release} onChange={(e) => updateTrack(track.id, { env: { ...track.env!, release: parseFloat(e.target.value) }})} className="w-full h-1 accent-neutral-400 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize" /></div>
             </div>
          )}
        </div>
        
        <div className="flex-1 flex justify-center w-full relative min-h-[100px]">
            {/* Meter */}
            <div className="w-1.5 h-full bg-neutral-800 rounded overflow-hidden mr-6 flex flex-col justify-end">
               <div ref={meterRef} className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500" style={{ height: '0%' }} />
            </div>
            {/* Slider */}
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={track.volume}
              onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
              className="h-full hover:cursor-ns-resize accent-emerald-500 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none w-1 custom-vertical-range absolute right-6 top-0"
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
            onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
            className="w-full accent-blue-500 h-1 bg-neutral-300 dark:bg-neutral-700 rounded appearance-none cursor-ew-resize"
          />
      </div>
    </div>
  );
}

function MasterChannel() {
  const { masterVolume, setMasterVolume } = useDAWStore();
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
            <div className="w-1.5 h-full bg-neutral-800 rounded overflow-hidden mr-6 flex flex-col justify-end">
               <div ref={meterRef} className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500" style={{ height: '0%' }} />
            </div>
            {/* Slider */}
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="h-full hover:cursor-ns-resize accent-red-500 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none w-1 custom-vertical-range absolute right-6 top-0"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            />
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center w-full px-2 opacity-0 pointer-events-none">
         <span className="text-[10px] text-neutral-500 font-mono mb-1">PAN</span>
         <input type="range" className="w-full h-1" />
      </div>
    </div>
  );
}

export function Mixer() {
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
      <div className="flex flex-1 overflow-x-auto custom-scrollbar bg-neutral-50 dark:bg-neutral-950 pr-4">
         {tracks.map(track => (
           <MixerChannel key={track.id} track={track} />
         ))}
         <MasterChannel />
      </div>
    </div>
  );
}
