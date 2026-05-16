import { useDAWStore, Track, Clip } from '../../store/dawStore';
import { Volume2, VolumeX, Headphones, Plus } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';

const SNAP_TO_BEAT = 1; // 1 beat

function TrackHeader({ track }: { track: Track }) {
  const { updateTrack, selectTrack, selectedTrackId, deleteTrack } = useDAWStore();
  const isSelected = selectedTrackId === track.id;

  return (
    <div 
      className={`h-24 border-b border-neutral-300 dark:border-neutral-800 flex flex-col p-2 select-none transition-colors ${isSelected ? 'bg-neutral-200 dark:bg-neutral-800' : 'bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800/50'}`}
      onClick={() => selectTrack(track.id)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold truncate text-neutral-800 dark:text-neutral-200">{track.name}</span>
        <div className="flex gap-1">
          <button 
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isMuted ? 'bg-orange-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { isMuted: !track.isMuted }); }}
          >
            M
          </button>
          <button 
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${track.isSolo ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
            onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { isSolo: !track.isSolo }); }}
          >
            S
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-auto">
        <Volume2 size={14} className="text-neutral-500" />
        <input 
          type="range" 
          min="0" max="1" step="0.01" 
          value={track.volume}
          onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
}

function ClipItem({ clip }: { clip: Clip }) {
  const { selectClip, selectedClipId, updateClip } = useDAWStore();
  const isSelected = selectedClipId === clip.id;
  const PIXELS_PER_BEAT = 20; // Sync this with timeline

  const handleDragEnd = (e: React.DragEvent) => {
      // Very basic drag implementation, ideally we'd use mousedown/move/up for better UX
  };

  return (
    <div
      className={`absolute h-20 top-2 rounded-md border-2 overflow-hidden cursor-pointer ${isSelected ? 'border-white z-10' : 'border-transparent'}`}
      style={{
        left: `${clip.start * PIXELS_PER_BEAT}px`,
        width: `${clip.duration * PIXELS_PER_BEAT}px`,
        backgroundColor: clip.color,
        opacity: isSelected ? 0.9 : 0.7
      }}
      onClick={(e) => { e.stopPropagation(); selectClip(clip.id); }}
    >
        <div className="px-2 py-1 text-xs font-bold text-black/60 truncate">
            {clip.type === 'midi' ? 'MIDI Clip' : 'Audio Clip'}
        </div>
        {/* Draw miniature notes if midi */}
        {clip.type === 'midi' && clip.notes && (
            <div className="absolute bottom-1 left-2 pl-0 right-2 top-5 flex">
                {clip.notes.map(note => (
                    <div 
                        key={note.id}
                        className="absolute h-1 bg-black/40 rounded-full"
                        style={{
                            left: `${(note.start / clip.duration) * 100}%`,
                            width: `${Math.max(2, (note.duration / clip.duration) * 100)}%`,
                            bottom: `${Math.random() * 80}%` // Dummy y-position for preview
                        }}
                    />
                ))}
            </div>
        )}
    </div>
  );
}

export function ArrangeView() {
  const { tracks, clips, addTrack, addClip, selectedTrackId } = useDAWStore();
  const PIXELS_PER_BEAT = 20; 
  const totalBeats = 128; // 32 bars

  const handleTrackLaneDoubleClick = (trackId: string, e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const beat = Math.floor(clickX / PIXELS_PER_BEAT);
      addClip(trackId, beat);
  };

  useEffect(() => {
    let animationFrameId: number;
    const updatePlayhead = () => {
      const playhead = document.getElementById('playhead');
      if (playhead && Tone.context.state === 'running') {
        const currentBeat = (Tone.Transport.ticks / Tone.Transport.PPQ); // Quarter notes
        playhead.style.left = `${currentBeat * PIXELS_PER_BEAT}px`;
      }
      animationFrameId = requestAnimationFrame(updatePlayhead);
    };
    updatePlayhead();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden bg-neutral-50 dark:bg-neutral-900 relative">
      {/* Track Headers Sidebar */}
      <div className="w-64 flex-shrink-0 bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col z-20">
        <div className="h-8 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800/50 flex items-center px-4 justify-between">
            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">TRACKS</span>
            <div className="flex gap-1">
                <button 
                  className="bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 p-1 rounded transition-colors"
                  onClick={() => addTrack('midi')}
                  title="Add MIDI Track"
                >
                    <Plus size={14} />
                </button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {tracks.map(t => <TrackHeader key={t.id} track={t} />)}
          <button 
            className="w-full h-12 flex items-center justify-center text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 border-b border-dashed border-neutral-300 dark:border-neutral-800 transition-colors"
            onClick={() => addTrack('midi')}
          >
            <Plus size={20} className="mr-2" /> Add Track
          </button>
        </div>
      </div>

      {/* Timeline & Clips Area */}
      <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden bg-neutral-100 dark:bg-neutral-950 relative custom-scrollbar">
        {/* Timeline Ruler */}
        <div 
          className="h-8 border-b border-neutral-300 dark:border-neutral-800 sticky top-0 z-10 flex text-xs text-neutral-500 overflow-visible cursor-crosshair bg-neutral-50 dark:bg-neutral-900"
          style={{ width: `${totalBeats * PIXELS_PER_BEAT}px` }}
          onClick={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
             const beat = clickX / PIXELS_PER_BEAT;
             if (Tone.context.state === 'running' || Tone.Transport.state !== 'stopped') {
                Tone.Transport.position = `0:${beat}:0`;
             }
          }}
        >
          {Array.from({ length: totalBeats / 4 }).map((_, i) => (
            <div 
              key={i} 
              className="pl-1 border-l border-neutral-300 dark:border-neutral-800"
              style={{ width: `${4 * PIXELS_PER_BEAT}px` }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Playhead indicator */}
        <div id="playhead" className="absolute top-0 bottom-0 w-px bg-emerald-500 z-30 pointer-events-none" style={{ left: '0px' }}>
            <div className="w-3 h-3 border border-emerald-500 rounded-full absolute -top-1.5 -translate-x-[calc(50%-0.5px)] bg-neutral-100 dark:bg-neutral-900" />
        </div>

        {/* Track Lanes */}
        <div className="flex flex-col min-h-max pb-32">
          {tracks.map(t => (
            <div 
                key={t.id} 
                className={`h-24 border-b border-neutral-300 dark:border-neutral-800 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiNFMkUyRTIiLz48L3N2Zz4=')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiM0MDQwNDAiLz48L3N2Zz4=')]`}
                onDoubleClick={(e) => handleTrackLaneDoubleClick(t.id, e)}
            >
                {clips.filter(c => c.trackId === t.id).map(c => (
                    <ClipItem key={c.id} clip={c} />
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
