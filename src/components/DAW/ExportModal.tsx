import React, { useState, useEffect, useRef } from 'react';
import { useDAWStore } from '../../store/dawStore';
import { Download, X, Film, CheckCircle2, Loader2, Music } from 'lucide-react';
import * as Tone from 'tone';
import { Dropdown } from '../ui/Dropdown';
import toast from 'react-hot-toast';
import { createExportPlan } from '../../lib/exportPlan';
import { useShallow } from 'zustand/react/shallow';
import { createTrackMixSettings } from '../../lib/mixSettings';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import ffmpegCoreURL from '@ffmpeg/core?url';
import ffmpegWasmURL from '@ffmpeg/core/wasm?url';
import { buildMixGraphPlan } from '../../lib/mixGraph';
import { computeClipPlaybackPlan, createFadeValueCurve } from '../../lib/audioEditing';
import { audioBufferToChannelData, audioDataToWav, processMasterAudio, sanitizeStemFileName, triggerBlobDownload } from '../../lib/audioExport';
import { generateAutomationSchedule } from '../../lib/automation';
import { beatsToSecondsWithTempoMap } from '../../lib/tempoMap';

let ffmpeg: FFmpeg | null = null;

export function ExportModal() {
  const titleId = React.useId();
  const { exportModalOpen, setExportModalOpen, clips, tracks, buses, sends, tempoTrack, bpm, masterVolume, loopStart, loopEnd, activeArrangementId } = useDAWStore(useShallow(state => ({
    exportModalOpen: state.exportModalOpen,
    setExportModalOpen: state.setExportModalOpen,
    clips: state.clips,
    tracks: state.tracks,
    buses: state.buses,
    sends: state.sends,
    tempoTrack: state.tempoTrack,
    bpm: state.bpm,
    masterVolume: state.masterVolume,
    loopStart: state.loopStart,
    loopEnd: state.loopEnd,
    activeArrangementId: state.activeArrangementId,
  })));
  const activeClips = clips.filter(clip => clip.arrangementId === activeArrangementId);
  
  const [format, setFormat] = useState('wav');
  const [sampleRate, setSampleRate] = useState('44100');
  const [region, setRegion] = useState('full');
  const [includeTail, setIncludeTail] = useState(true);
  const [tailSeconds, setTailSeconds] = useState(2);
  const [normalize, setNormalize] = useState(false);
  const [limiterEnabled, setLimiterEnabled] = useState(true);
  const [limiterCeilingDb, setLimiterCeilingDb] = useState(-1);
  const [stems, setStems] = useState(false);
  
  const [status, setStatus] = useState<'idle' | 'rendering' | 'encoding' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  
  if (!exportModalOpen) return null;

  // Calculate project details
  const lastClipEnd = activeClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  const totalDurationSeconds = beatsToSecondsWithTempoMap(lastClipEnd, tempoTrack);
  
  const handleExport = async () => {
    setStatus('rendering');
    setProgress(0);
    
    // Simulate rendering progress since Tone.Offline doesn't easily report intermediate progress
    const updateProgress = () => {
        setProgress(p => {
            if (p >= 50) return p;
            return p + 5;
        });
    };
    const interval = setInterval(updateProgress, 100);

    try {
        const plan = createExportPlan({
          clips: activeClips,
          bpm,
          region: region as 'full' | 'selection',
          loopStart,
          loopEnd,
          sampleRate: Number(sampleRate),
          tempoTrack,
          includeTail,
          tailSeconds,
          normalize,
          limiter: { enabled: limiterEnabled, ceilingDb: limiterCeilingDb },
          stems,
        });
        const renderClips = activeClips.filter(clip =>
          clip.start < plan.endBeat && clip.start + clip.duration > plan.startBeat
        );
        const rootBusId = buses.find(bus => bus.outputBusId == null)?.id;
        if (!rootBusId) throw new Error('Export routing requires a destination bus');
        const mixGraphPlan = buildMixGraphPlan(
          tracks.map(track => ({ id: track.id, outputBusId: track.outputBusId ?? rootBusId })),
          buses,
          sends,
        );

        const renderOne = async (sourceTrackId?: string) => {
          const sourceClips = sourceTrackId == null ? renderClips : renderClips.filter(clip => clip.trackId === sourceTrackId);
          return Tone.Offline(async () => {
             Tone.Transport.bpm.value = bpm;
             Tone.Destination.volume.value = masterVolume === 0 ? -Infinity : 20 * Math.log10(masterVolume);
             Tone.getContext().lookAhead = 0;

             const synths = new Map();
             const trackInputs = new Map<string, Tone.Gain>();
             const trackOutputs = new Map<string, Tone.Gain>();
             const trackChannels = new Map<string, Tone.Channel>();
             const trackReverbs = new Map<string, Tone.Reverb>();
             const trackDelays = new Map<string, Tone.FeedbackDelay>();
             const busInputs = new Map<string, Tone.Gain>();
             const busOutputs = new Map<string, Tone.Gain>();
             const sendGains = new Map<string, Tone.Gain>();
             const players = new Map();
             const fadeGains = new Map<string, Tone.Gain>();
             
             for (const track of tracks) {
                 const mix = createTrackMixSettings(track);
                 const input = new Tone.Gain(1);
                 const channel = new Tone.Channel();
                 const output = new Tone.Gain(1);
                 channel.volume.value = mix.volumeDb;
                 channel.pan.value = mix.pan;
                 channel.mute = mix.muted;
                 channel.solo = mix.solo;
                 
                 const reverb = new Tone.Reverb(2);
                 const delay = new Tone.FeedbackDelay("8n", 0.3);
                 reverb.wet.value = mix.reverbWet;
                 delay.wet.value = mix.delayWet;
                 input.connect(channel);
                 channel.chain(delay, reverb, output);

                 trackInputs.set(track.id, input);
                 trackOutputs.set(track.id, output);
                 trackChannels.set(track.id, channel);
                 trackReverbs.set(track.id, reverb);
                 trackDelays.set(track.id, delay);

                 if (track.type === 'midi') {
                     let synth;
                     switch(track.instrument) {
                        case 'piano':
                            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: track.env || { attack: 0.02, decay: 1, sustain: 0.4, release: 1 } });
                            break;
                        case 'bass':
                            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: track.env || { attack: 0.05, decay: 0.3, sustain: 0.2, release: 1 } });
                            break;
                        case 'drum':
                            synth = new Tone.PolySynth(Tone.MembraneSynth);
                            break;
                        case 'synth':
                        default:
                            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square' }, envelope: track.env || { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 } });
                            break;
                     }
                     synth.connect(input);
                     synths.set(track.id, synth);
                 }
             }

             for (const bus of buses) {
                 const input = new Tone.Gain(1);
                 const channel = new Tone.Channel();
                 const output = new Tone.Gain(1);
                 channel.volume.value = bus.volume === 0 ? -Infinity : 20 * Math.log10(bus.volume);
                 channel.pan.value = bus.pan;
                 channel.mute = bus.isMuted;
                 input.connect(channel);
                 let tail: Tone.ToneAudioNode = channel;
                 for (const effect of bus.effects) {
                     if (!effect.enabled) continue;
                     let node: Tone.ToneAudioNode;
                     if (effect.type === 'reverb') node = new Tone.Reverb(effect.parameters.decay ?? 2);
                     else if (effect.type === 'delay') node = new Tone.FeedbackDelay(effect.parameters.delayTime ?? 0.25, effect.parameters.feedback ?? 0.3);
                     else node = new Tone.Limiter(effect.parameters.threshold ?? -1);
                     tail.connect(node);
                     tail = node;
                 }
                 tail.connect(output);
                 busInputs.set(bus.id, input);
                 busOutputs.set(bus.id, output);
             }

             const endpoint = (id: string): Tone.ToneAudioNode | typeof Tone.Destination | undefined => {
                 if (id === 'destination') return Tone.Destination;
                 const trackMatch = /^track:(.+):(pre|post)$/.exec(id);
                 if (trackMatch) return trackMatch[2] === 'pre' ? trackInputs.get(trackMatch[1]) : trackOutputs.get(trackMatch[1]);
                 const busMatch = /^bus:(.+):(input|pre|post)$/.exec(id);
                 if (busMatch) return busMatch[2] === 'post' ? busOutputs.get(busMatch[1]) : busInputs.get(busMatch[1]);
                 return undefined;
             };
             for (const edge of mixGraphPlan.edges) {
                 const source = endpoint(edge.from);
                 const target = endpoint(edge.to);
                 if (!source || !target) throw new Error(`Offline routing endpoint missing for ${edge.id}`);
                 if (edge.kind === 'output') source.connect(target as Tone.InputNode);
                 else {
                     const gain = new Tone.Gain(edge.gain);
                     source.connect(gain);
                     gain.connect(target as Tone.InputNode);
                     sendGains.set(edge.id, gain);
                 }
             }

             for (const track of tracks) {
               for (const lane of track.automationLanes ?? []) {
                 if (!lane.enabled || lane.points.length === 0) continue;
                 const param: any = lane.target === 'volume' ? trackChannels.get(track.id)?.volume
                   : lane.target === 'pan' ? trackChannels.get(track.id)?.pan
                     : lane.target === 'reverb' ? trackReverbs.get(track.id)?.wet
                       : lane.target === 'delay' ? trackDelays.get(track.id)?.wet
                         : Tone.Destination.volume;
                 if (!param) continue;
                 const schedule = generateAutomationSchedule(lane.points, plan.secondsAtBeat, plan.startBeat, plan.endBeat);
                 for (const entry of schedule) {
                   const isDecibels = lane.target === 'volume' || lane.target === 'masterVolume';
                   const value = isDecibels ? (entry.value === 0 ? -Infinity : 20 * Math.log10(entry.value)) : entry.value;
                   if (entry.rampType === 'set') param.setValueAtTime(value, entry.time);
                   else if (entry.rampType === 'exponential' && !isDecibels) param.exponentialRampToValueAtTime(value, entry.time);
                   else param.linearRampToValueAtTime(value, entry.time);
                 }
               }
             }

             // Pre-load audio buffers for audio tracks
             const audioClips = sourceClips.filter(c => c.type === 'audio' && c.bufferUrl);
             for (const clip of audioClips) {
                 const trackInput = trackInputs.get(clip.trackId);
                 if (trackInput) {
                     const player = new Tone.Player({ url: clip.bufferUrl! });
                     await player.load(clip.bufferUrl!);
                     const playback = computeClipPlaybackPlan(clip, tempoTrack, player.buffer.duration);
                     player.volume.value = playback.gainDb;
                     player.fadeIn = 0;
                     player.fadeOut = 0;
                     player.reverse = playback.reversed;
                     const fadeGain = new Tone.Gain(playback.fadeInSeconds > 0 ? 0 : 1).connect(trackInput);
                     player.connect(fadeGain);
                     players.set(clip.id, player);
                     fadeGains.set(clip.id, fadeGain);
                 }
             }

             for (const clip of sourceClips) {
                 const renderStartBeat = Math.max(plan.startBeat, clip.start);
                 const startTimeSeconds = plan.secondsAtBeat(renderStartBeat);
                 
                 if (clip.type === 'midi' && clip.notes) {
                     const synth = synths.get(clip.trackId);
                     if (!synth) continue;
                     
                     clip.notes.forEach(note => {
                         const absoluteNoteStartBeat = clip.start + note.start;
                         if (absoluteNoteStartBeat < plan.startBeat || absoluteNoteStartBeat >= plan.endBeat) return;
                         const noteEndBeat = Math.min(absoluteNoteStartBeat + note.duration, plan.endBeat);
                         const noteStartTimeSeconds = plan.secondsAtBeat(absoluteNoteStartBeat);
                         const durationSeconds = plan.secondsAtBeat(noteEndBeat) - noteStartTimeSeconds;
                         synth.triggerAttackRelease(note.note, durationSeconds, noteStartTimeSeconds, note.velocity);
                     });
                 } else if (clip.type === 'audio' && clip.bufferUrl) {
                     const player = players.get(clip.id);
                     if (player) {
                         const playback = computeClipPlaybackPlan(clip, tempoTrack, player.buffer.duration);
                         const offsetSeconds = plan.secondsAtBeat(renderStartBeat) - plan.secondsAtBeat(clip.start);
                         const renderEndBeat = Math.min(clip.start + clip.duration, plan.endBeat);
                         const availableSeconds = plan.secondsAtBeat(renderEndBeat) - plan.secondsAtBeat(renderStartBeat);
                         const fadeGain = fadeGains.get(clip.id);
                         if (fadeGain) {
                           fadeGain.gain.cancelScheduledValues(startTimeSeconds);
                           if (playback.fadeInSeconds > 0 && renderStartBeat === clip.start) {
                             fadeGain.gain.setValueCurveAtTime(
                               createFadeValueCurve(playback.fadeInCurve, 'in'),
                               startTimeSeconds,
                               playback.fadeInSeconds,
                             );
                           } else {
                             fadeGain.gain.setValueAtTime(1, startTimeSeconds);
                           }
                           if (playback.fadeOutSeconds > 0) {
                             const fadeOutStart = plan.secondsAtBeat(clip.start + clip.duration) - playback.fadeOutSeconds;
                             if (fadeOutStart >= 0 && fadeOutStart < plan.contentDurationSeconds) {
                               fadeGain.gain.setValueCurveAtTime(
                                 createFadeValueCurve(playback.fadeOutCurve, 'out'),
                                 fadeOutStart,
                                 playback.fadeOutSeconds,
                               );
                             }
                           }
                         }
                         player.start(
                           startTimeSeconds,
                           playback.sourceOffsetSeconds + offsetSeconds,
                           Math.min(playback.durationSeconds - offsetSeconds, availableSeconds),
                         );
                     }
                 }
             }
             
             Tone.Transport.start(0);
        }, plan.durationSeconds, 2, plan.sampleRate);
        };

        clearInterval(interval);
        setProgress(50);
        setStatus('encoding');

        let finalBlob: Blob;
        let downloadName: string;
        if (plan.stems) {
          const stemTracks = tracks.filter(track => renderClips.some(clip => clip.trackId === track.id));
          if (stemTracks.length === 0) throw new Error('No active tracks are available for stem export');
          const { default: JSZip } = await import('jszip');
          const zip = new JSZip();
          for (let index = 0; index < stemTracks.length; index += 1) {
            const track = stemTracks[index];
            const rendered = await renderOne(track.id);
            const processed = processMasterAudio(audioBufferToChannelData(rendered.get()), {
              normalize: plan.normalize,
              limiter: plan.limiter,
            });
            zip.file(sanitizeStemFileName(track.name, track.id), audioDataToWav(processed));
            setProgress(50 + Math.round(((index + 1) / stemTracks.length) * 45));
          }
          finalBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          downloadName = `project_stems_${Date.now()}.zip`;
        } else {
          const rendered = await renderOne();
          const processed = processMasterAudio(audioBufferToChannelData(rendered.get()), {
            normalize: plan.normalize,
            limiter: plan.limiter,
          });
          finalBlob = audioDataToWav(processed);
          downloadName = `project_export_${Date.now()}.${format}`;

          if (format !== 'wav') {
            if (!ffmpeg) {
              ffmpeg = new FFmpeg();
              ffmpeg.on('progress', ({ progress: p }) => setProgress(50 + Math.round(p * 50)));
              await ffmpeg.load({ coreURL: ffmpegCoreURL, wasmURL: ffmpegWasmURL });
            }
            const inputName = 'input.wav';
            const outputName = `output.${format}`;
            try {
              await ffmpeg.writeFile(inputName, new Uint8Array(await finalBlob.arrayBuffer()));
              await ffmpeg.exec(['-i', inputName, outputName]);
              const outputData = await ffmpeg.readFile(outputName);
              finalBlob = new Blob([outputData as Uint8Array<ArrayBuffer>], { type: `audio/${format}` });
            } finally {
              await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
            }
          }
        }

        setProgress(100);
        triggerBlobDownload(finalBlob, downloadName);
        setStatus('done');
    } catch (error) {
        clearInterval(interval);
        setStatus('idle');
        toast.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 selection:bg-emerald-500/30">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-neutral-50 dark:bg-neutral-900 w-full max-w-xl rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Download size={18} />
            </div>
            <h2 id={titleId} className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">Export Audio</h2>
          </div>
          <button 
            aria-label="Close export dialog"
            onClick={() => { setExportModalOpen(false); setStatus('idle'); setProgress(0); }}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
            disabled={status === 'rendering' || status === 'encoding'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-8">
            
            <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Format</label>
                        <Dropdown 
                            options={[
                              { value: 'wav', label: 'WAV (Lossless)' },
                              { value: 'mp3', label: 'MP3 (Compressed)' },
                              { value: 'ogg', label: 'OGG Vorbis' }
                            ]}
                            value={format}
                            onChange={v => setFormat(v as string)}
                            disabled={status !== 'idle'}
                            className="w-full"
                            align="left"
                            triggerClassName="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md h-10 px-3 flex items-center justify-between text-sm text-neutral-800 dark:text-neutral-200 outline-none hover:border-emerald-500 transition-colors cursor-pointer"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Sample Rate</label>
                        <Dropdown 
                            options={[
                              { value: '44100', label: '44100 Hz (CD Quality)' },
                              { value: '48000', label: '48000 Hz (Video Standard)' },
                              { value: '96000', label: '96000 Hz (High Res)' }
                            ]}
                            value={sampleRate}
                            onChange={v => setSampleRate(v as string)}
                            disabled={status !== 'idle'}
                            className="w-full"
                            align="left"
                            triggerClassName="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md h-10 px-3 flex items-center justify-between text-sm text-neutral-800 dark:text-neutral-200 outline-none hover:border-emerald-500 transition-colors cursor-pointer"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Export Region</label>
                        <Dropdown 
                            options={[
                              { value: 'full', label: 'Full Project' },
                              { value: 'selection', label: 'Loop Selection (Marquee)' }
                            ]}
                            value={region}
                            onChange={v => setRegion(v as string)}
                            disabled={status !== 'idle'}
                            className="w-full"
                            align="left"
                            triggerClassName="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md h-10 px-3 flex items-center justify-between text-sm text-neutral-800 dark:text-neutral-200 outline-none hover:border-emerald-500 transition-colors cursor-pointer"
                        />
                    </div>
                    
                    <div className="h-full bg-neutral-100 dark:bg-neutral-800/50 rounded-md border border-neutral-200 dark:border-neutral-700 p-4 flex flex-col justify-center">
                         <div className="text-xs font-bold text-neutral-500 uppercase mb-2">Project Stats</div>
                         <div className="flex justify-between items-center text-sm mb-1">
                             <span className="text-neutral-600 dark:text-neutral-400">Total Length</span>
                             <span className="font-mono text-neutral-900 dark:text-neutral-100">{totalDurationSeconds.toFixed(2)}s</span>
                         </div>
                         <div className="flex justify-between items-center text-sm mb-1">
                             <span className="text-neutral-600 dark:text-neutral-400">Active Tracks</span>
                             <span className="font-mono text-neutral-900 dark:text-neutral-100">{tracks.length}</span>
                         </div>
                         <div className="flex justify-between items-center text-sm">
                             <span className="text-neutral-600 dark:text-neutral-400">Total Clips</span>
                             <span className="font-mono text-neutral-900 dark:text-neutral-100">{clips.length}</span>
                         </div>
                    </div>
                </div>
            </div>

            <fieldset className="grid grid-cols-2 gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 p-4" disabled={status !== 'idle'}>
              <legend className="px-1 text-xs font-bold text-neutral-500 uppercase">Render Processing</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeTail} onChange={event => setIncludeTail(event.target.checked)} /> Effect tail
                <input aria-label="Tail seconds" type="number" min="0" max="30" step="0.5" value={tailSeconds} onChange={event => setTailSeconds(Number(event.target.value))} disabled={!includeTail || status !== 'idle'} className="w-16 rounded bg-neutral-100 dark:bg-neutral-800 px-1" /> s
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={normalize} onChange={event => setNormalize(event.target.checked)} /> Normalize peak</label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={limiterEnabled} onChange={event => setLimiterEnabled(event.target.checked)} /> Limiter
                <input aria-label="Limiter ceiling dBFS" type="number" min="-24" max="0" step="0.5" value={limiterCeilingDb} onChange={event => setLimiterCeilingDb(Number(event.target.value))} className="w-16 rounded bg-neutral-100 dark:bg-neutral-800 px-1" /> dBFS
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stems} onChange={event => setStems(event.target.checked)} /> Track stems (ZIP/WAV)</label>
            </fieldset>

            {/* Progress / Actions */}
            <div className="pt-6 border-t border-neutral-200 dark:border-neutral-800">
                {status === 'idle' ? (
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setExportModalOpen(false)}
                            className="px-6 h-10 rounded-md text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleExport}
                            className="px-6 h-10 rounded-md text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                        >
                            Start Export
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                {status === 'rendering' && <Loader2 size={16} className="animate-spin" />}
                                {status === 'encoding' && <Loader2 size={16} className="animate-spin" />}
                                {status === 'done' && <CheckCircle2 size={16} />}
                                {status}
                            </span>
                            <span className="font-mono text-neutral-500">{progress}%</span>
                        </div>
                        <div
                            role="progressbar"
                            aria-label={`Export ${status}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                            aria-live="polite"
                            className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden"
                        >
                            <div 
                                className="h-full bg-emerald-500 transition-all duration-300 ease-out" 
                                style={{ width: `${progress}%` }} 
                            />
                        </div>
                        {status === 'done' && (
                             <div className="flex justify-end mt-2">
                                <button 
                                    onClick={() => { setStatus('idle'); setExportModalOpen(false); }}
                                    className="px-6 h-10 rounded-md text-sm font-semibold bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white transition-colors"
                                >
                                    Close
                                </button>
                             </div>
                        )}
                    </div>
                )}
            </div>

        </div>
      </div>
    </div>
  );
}
