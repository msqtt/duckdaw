import React, { useState } from 'react';
import { useDAWStore, Track } from '../../store/dawStore';
import { Volume2, VolumeX, Headphones, Music, Mic, Trash2, Edit2, SlidersHorizontal } from 'lucide-react';
import { createPluginDescriptor, pluginInstrumentToLegacyType } from '../../lib/pluginSdk';
import { getDefaultPluginRegistry } from '../../lib/pluginRuntime';
import { usePluginInspectorStore } from '../../store/pluginInspectorStore';
import { AutomationCreateButton } from './AutomationCreateButton';
import { useShallow } from 'zustand/react/shallow';


const pluginRegistry = getDefaultPluginRegistry();
const instrumentDefinitions = pluginRegistry.list('instrument');
export let currentDragTrackSourceIndex: number | null = null;
export function setTrackDragSource(val: any) { currentDragTrackSourceIndex = val; }
export function handleTrackDragEnd() { currentDragTrackSourceIndex = null; }

function TrackHeaderComponent({ track, index, onDeletePrompt, dragTargetIndex, setDragTargetIndex }: { track: Track, index: number, key?: React.Key, onDeletePrompt?: (type: 'track'|'clip', id: string) => void, dragTargetIndex?: number | null, setDragTargetIndex?: (i: number | null) => void }) {
  const { updateTrack, selectTrack, selectedTrackId, deleteTrack, reorderTrack } = useDAWStore(useShallow(state => ({
      updateTrack: state.updateTrack,
      selectTrack: state.selectTrack,
      selectedTrackId: state.selectedTrackId,
      deleteTrack: state.deleteTrack,
      reorderTrack: state.reorderTrack
  })));
  const openPluginInspector = usePluginInspectorStore(state => state.open);
  
  const isSelected = selectedTrackId === track.id;
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(track.name);
  const [canDrag, setCanDrag] = useState(true);

  return (
    <div 
      data-testid="track-header"
      data-track-type={track.type}
      draggable={!isEditing && canDrag}
      onDragStart={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') {
              e.preventDefault();
              return;
          }
          e.dataTransfer.setData('text/plain', `track:${index}`);
          e.dataTransfer.setData('trackIndex', index.toString());
          e.dataTransfer.effectAllowed = 'move';
          currentDragTrackSourceIndex = index;
      }}
      onDragOver={(e) => {
          e.preventDefault();
          if (currentDragTrackSourceIndex !== null && setDragTargetIndex) {
               const rect = e.currentTarget.getBoundingClientRect();
               const isTopHalf = (e.clientY - rect.top) < (rect.height / 2);
               setDragTargetIndex(isTopHalf ? index : index + 1);
          }
      }}
      onDragLeave={(e) => {
          // avoid clearing immediately to reduce flicker
      }}
      onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          let fromIndexRaw = e.dataTransfer.getData('trackIndex') || e.dataTransfer.getData('trackindex');
          
          if (!fromIndexRaw) {
              const textPlain = e.dataTransfer.getData('text/plain');
              if (textPlain && textPlain.startsWith('track:')) {
                  fromIndexRaw = textPlain.split(':')[1];
              }
          }

          if (fromIndexRaw) {
              const fromIndex = parseInt(fromIndexRaw);
              const tracks = useDAWStore.getState().tracks;
              const target = dragTargetIndex !== null && dragTargetIndex !== undefined ? dragTargetIndex : index;
              if (!isNaN(fromIndex) && tracks[fromIndex]) {
                  reorderTrack(tracks[fromIndex].id, target);
              }
          }
          handleTrackDragEnd();
          if (setDragTargetIndex) setDragTargetIndex(null);
      }}
      className={`h-24 border-b border-neutral-300 dark:border-neutral-800 flex flex-col justify-center px-3 relative group transition-colors select-none ${isSelected ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200 dark:hover:bg-neutral-800/80 bg-neutral-100 dark:bg-neutral-900'}`}
      onClick={() => selectTrack(track.id)}
    >
        {/* DropIndicator */}
        {dragTargetIndex === index && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 z-50 pointer-events-none" />
        )}
        <div className="flex items-center gap-2 mb-2">
            <div 
               className="w-3 h-3 rounded-full flex-shrink-0" 
               style={{ backgroundColor: track.color }} 
            />
            {isEditing ? (
                <input 
                    autoFocus
                    className="flex-1 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white border border-emerald-500 rounded px-1 text-sm outline-none w-24"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={() => {
                        setIsEditing(false);
                        updateTrack(track.id, { name: nameInput.trim() || undefined });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                />
            ) : (
                <span 
                    className="text-sm font-semibold truncate flex-1 cursor-text"
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                    }}
                >
                    {track.name || `Track ${index + 1}`}
                </span>
            )}
            {track.type === 'midi' ? <Music size={14} className="text-neutral-400" /> : <Mic size={14} className="text-neutral-400" />}
        </div>
        
        <div className="flex items-center gap-2 justify-between">
            <div 
                className="flex items-center gap-1"
                onMouseEnter={() => setCanDrag(false)}
                onMouseLeave={() => setCanDrag(true)}
                onTouchStart={() => setCanDrag(false)}
                onTouchEnd={() => setCanDrag(true)}
            >
                <button 
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${track.isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
                  onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { isMuted: !track.isMuted }); }}
                  title="Mute"
                >
                    {track.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <AutomationCreateButton
                  trackId={track.id}
                  trackName={track.name}
                  binding={{ target: 'track.mute', label: 'Mute', range: { min: 0, max: 1 }, valueType: 'discrete' }}
                  currentValue={track.isMuted ? 1 : 0}
                />
                <button 
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${track.isSolo ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
                  onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { isSolo: !track.isSolo }); }}
                  title="Solo"
                >
                    <Headphones size={12} />
                </button>
                <AutomationCreateButton
                  trackId={track.id}
                  trackName={track.name}
                  binding={{ target: 'track.solo', label: 'Solo', range: { min: 0, max: 1 }, valueType: 'discrete' }}
                  currentValue={track.isSolo ? 1 : 0}
                />
            </div>

            {track.type === 'midi' && (
              <div
                className="flex min-w-0 flex-1 items-center gap-1"
                onMouseEnter={() => setCanDrag(false)}
                onMouseLeave={() => setCanDrag(true)}
                onTouchStart={() => setCanDrag(false)}
                onTouchEnd={() => setCanDrag(true)}
                onClick={event => event.stopPropagation()}
              >
                <label className="sr-only" htmlFor={`instrument-${track.id}`}>Instrument for {track.name}</label>
                <select
                  id={`instrument-${track.id}`}
                  aria-label={`Instrument for ${track.name}`}
                  value={track.instrumentPlugin?.pluginId ?? ''}
                  onChange={event => {
                    const definition = pluginRegistry.get(event.target.value);
                    if (definition?.kind !== 'instrument') return;
                    const descriptor = createPluginDescriptor(definition, track.instrumentPlugin?.id);
                    updateTrack(track.id, {
                      instrumentPlugin: descriptor,
                      instrument: pluginInstrumentToLegacyType(descriptor.pluginId),
                    });
                    openPluginInspector({ ownerType: 'track', ownerId: track.id, kind: 'instrument' });
                  }}
                  className="h-6 min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 text-[10px] dark:border-neutral-700 dark:bg-neutral-800"
                >
                  {track.instrumentPlugin != null && pluginRegistry.get(track.instrumentPlugin.pluginId)?.kind !== 'instrument' && (
                    <option value={track.instrumentPlugin.pluginId}>Unavailable</option>
                  )}
                  <option value="" disabled>Instrument</option>
                  {instrumentDefinitions.map(definition => (
                    <option key={definition.id} value={definition.id}>{definition.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Open instrument details for ${track.name}`}
                  disabled={track.instrumentPlugin == null}
                  onClick={() => openPluginInspector({ ownerType: 'track', ownerId: track.id, kind: 'instrument' })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-300 text-neutral-600 hover:bg-emerald-500/20 hover:text-emerald-600 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-300"
                ><SlidersHorizontal size={12} /></button>
              </div>
            )}
            
            <div 
                className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseEnter={() => setCanDrag(false)}
                onMouseLeave={() => setCanDrag(true)}
                onTouchStart={() => setCanDrag(false)}
                onTouchEnd={() => setCanDrag(true)}
            >
                <button 
                    className="p-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                    }}
                    title="Rename"
                >
                    <Edit2 size={12} />
                </button>
                <button 
                    className="p-1 text-neutral-500 hover:text-red-500 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onDeletePrompt) onDeletePrompt('track', track.id);
                        else deleteTrack(track.id);
                    }}
                    title="Delete Track"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
        
        {/* Volume slider */}
        <div 
           className="mt-2 flex items-center gap-2 group/vol"
           onMouseEnter={() => setCanDrag(false)}
           onMouseLeave={() => setCanDrag(true)}
           onTouchStart={() => setCanDrag(false)}
           onTouchEnd={() => setCanDrag(true)}
        >
            <span className="text-[10px] text-neutral-400 w-3">Vol</span>
            <input 
                type="range" 
                aria-label={`Volume ${track.name}`}
               aria-valuetext={`${Math.round(track.volume * 100)}%`}
               min="0" max="1" step="0.01"
                value={track.volume}
                onClick={e => e.stopPropagation()}
                onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                className="flex-1 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-ew-resize accent-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:rounded-full"
            />
            <AutomationCreateButton
              trackId={track.id}
              trackName={track.name}
              binding={{ target: 'volume', label: 'Volume', range: { min: 0, max: 1 }, valueType: 'continuous' }}
              currentValue={track.volume}
            />
            <span className="text-[10px] text-neutral-400 w-6 text-right tabular-nums">
                {Math.round(track.volume * 100)}
            </span>
        </div>
    </div>
  );
}

export const TrackHeader = React.memo(TrackHeaderComponent);
