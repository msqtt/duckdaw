import React, { useState, useEffect, useRef } from 'react';
import { useDAWStore } from '../../store/dawStore';
import { Download, X, Film, CheckCircle2, Loader2, Music } from 'lucide-react';
import * as Tone from 'tone';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

// Simple WAV encoder for the MVP
function audioBufferToWav(buffer: AudioBuffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const result = new Float32Array(buffer.length * numChannels);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
        result[i * numChannels + channel] = channelData[i];
    }
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++) {
    let sample = Math.max(-1, Math.min(1, result[i]));
    sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, sample, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function ExportModal() {
  const { exportModalOpen, setExportModalOpen, clips, tracks, bpm } = useDAWStore();
  
  const [format, setFormat] = useState('wav');
  const [sampleRate, setSampleRate] = useState('44100');
  const [region, setRegion] = useState('full');
  
  const [status, setStatus] = useState<'idle' | 'rendering' | 'encoding' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  
  if (!exportModalOpen) return null;

  // Calculate project details
  const lastClipEnd = clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  const totalDurationSeconds = (lastClipEnd / (bpm / 60)); // beats / (beats per sec)
  
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
        const renderDuration = Math.max(1, totalDurationSeconds);

        const renderedToneBuffer = await Tone.Offline(async ({ context }) => {
             Tone.Transport.bpm.value = bpm;
             Tone.getContext().lookAhead = 0;

             const synths = new Map();
             const channels = new Map();
             const players = new Map();
             
             for (const track of tracks) {
                 const channel = new Tone.Channel().toDestination();
                 channel.volume.value = track.volume === 0 ? -Infinity : 20 * Math.log10(track.volume);
                 channel.pan.value = track.pan;
                 channel.mute = track.isMuted;
                 channel.solo = track.isSolo;
                 
                 const reverb = new Tone.Reverb(2);
                 const delay = new Tone.FeedbackDelay("8n", 0.3);
                 reverb.wet.value = track.reverb || 0;
                 delay.wet.value = track.delay || 0;
                 channel.chain(delay, reverb, context.destination);
                 
                 channels.set(track.id, channel);

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
                     synth.connect(channel);
                     synths.set(track.id, synth);
                 }
             }

             const beatTime = 60 / bpm;
             
             // Pre-load audio buffers for audio tracks
             const audioClips = clips.filter(c => c.type === 'audio' && c.bufferUrl);
             for (const clip of audioClips) {
                 const channel = channels.get(clip.trackId);
                 if (channel) {
                     const player = new Tone.Player({ url: clip.bufferUrl! });
                     await player.load(clip.bufferUrl!);
                     player.connect(channel);
                     players.set(clip.id, player);
                 }
             }

             for (const clip of clips) {
                 const absoluteStartBeat = clip.start;
                 const startTimeSeconds = absoluteStartBeat * beatTime;
                 
                 if (clip.type === 'midi' && clip.notes) {
                     const synth = synths.get(clip.trackId);
                     if (!synth) continue;
                     
                     clip.notes.forEach(note => {
                         const absoluteNoteStartBeat = clip.start + note.start;
                         const noteStartTimeSeconds = absoluteNoteStartBeat * beatTime;
                         const durationSeconds = note.duration * beatTime;
                         synth.triggerAttackRelease(note.note, durationSeconds, noteStartTimeSeconds, note.velocity);
                     });
                 } else if (clip.type === 'audio' && clip.bufferUrl) {
                     const player = players.get(clip.id);
                     if (player) {
                         player.start(startTimeSeconds);
                     }
                 }
             }
             
             Tone.Transport.start(0);
        }, renderDuration);

        clearInterval(interval);
        setProgress(50);
        setStatus('encoding');

        const audioBuffer = renderedToneBuffer.get();
        let finalBlob = audioBufferToWav(audioBuffer);

        if (format !== 'wav') {
            if (!ffmpeg) {
                ffmpeg = new FFmpeg();
                ffmpeg.on('progress', ({ progress: p }) => {
                    setProgress(50 + Math.round(p * 50));
                });
                await ffmpeg.load({
                    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
                    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
                });
            }

            const inputName = 'input.wav';
            const outputName = `output.${format}`;
            
            const wavData = new Uint8Array(await finalBlob.arrayBuffer());
            await ffmpeg.writeFile(inputName, wavData);
            
            await ffmpeg.exec(['-i', inputName, outputName]);
            
            const outputData = await ffmpeg.readFile(outputName);
            finalBlob = new Blob([outputData], { type: `audio/${format}` });
        } else {
            setProgress(100);
        }
        
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `project_export_${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        
        setStatus('done');
    } catch (err) {
        console.error(err);
        clearInterval(interval);
        setStatus('idle');
        alert("Render failed.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 selection:bg-emerald-500/30">
      <div className="bg-neutral-50 dark:bg-neutral-900 w-full max-w-xl rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Download size={18} />
            </div>
            <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">Export Audio</h2>
          </div>
          <button 
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
                        <select 
                            className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md h-10 px-3 text-sm text-neutral-800 dark:text-neutral-200 outline-none focus:border-emerald-500"
                            value={format}
                            onChange={e => setFormat(e.target.value)}
                            disabled={status !== 'idle'}
                        >
                            <option value="wav">WAV (Lossless)</option>
                            <option value="mp3">MP3 (Compressed)</option>
                            <option value="ogg">OGG Vorbis</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Sample Rate</label>
                        <select 
                            className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md h-10 px-3 text-sm text-neutral-800 dark:text-neutral-200 outline-none focus:border-emerald-500"
                            value={sampleRate}
                            onChange={e => setSampleRate(e.target.value)}
                            disabled={status !== 'idle'}
                        >
                            <option value="44100">44100 Hz (CD Quality)</option>
                            <option value="48000">48000 Hz (Video Standard)</option>
                            <option value="96000">96000 Hz (High Res)</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Export Region</label>
                        <select 
                            className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md h-10 px-3 text-sm text-neutral-800 dark:text-neutral-200 outline-none focus:border-emerald-500"
                            value={region}
                            onChange={e => setRegion(e.target.value)}
                            disabled={status !== 'idle'}
                        >
                            <option value="full">Full Project</option>
                            <option value="selection">Loop Selection (Marquee)</option>
                        </select>
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
                        <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
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
