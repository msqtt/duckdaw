import React from 'react';
import { useDAWStore, Track } from '../../store/dawStore';
import { Volume2, VolumeX } from 'lucide-react';

const MixerChannel: React.FC<{ track: Track }> = ({ track }) => {
  const { updateTrack } = useDAWStore();

  return (
    <div className="w-24 shrink-0 bg-neutral-200 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col items-center py-2 h-full">
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

      <div className="flex-1 flex flex-col items-center justify-end w-full relative group px-4">
        <div className="absolute inset-y-0 w-8 flex justify-center py-2">
          <input 
            type="range" 
            min="0" max="1" step="0.01" 
            value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            className="h-full hover:cursor-ns-resize accent-emerald-500 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none w-1 custom-vertical-range absolute -translate-x-1/2 left-1/2 top-0"
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

export function Mixer() {
  const { tracks, setBottomPanel } = useDAWStore();
  
  return (
    <div className="h-64 sm:h-80 bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800 flex flex-col relative select-none">
      <div className="h-8 bg-neutral-200/80 dark:bg-neutral-800/80 border-b border-neutral-300 dark:border-neutral-800 flex items-center px-4 justify-between shrink-0">
        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">MIXER</span>
        <button 
          onClick={() => setBottomPanel(null)}
          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white mb-1 leading-none text-lg font-mono font-bold"
        >
          &times;
        </button>
      </div>
      <div className="flex flex-1 overflow-x-auto custom-scrollbar bg-neutral-50 dark:bg-neutral-950">
         {tracks.map(track => (
           <MixerChannel key={track.id} track={track} />
         ))}
      </div>
    </div>
  );
}
