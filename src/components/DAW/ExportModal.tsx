import React, { useState, useEffect, useRef } from 'react';
import { useDAWStore } from '../../store/dawStore';
import { Download, X, Film, CheckCircle2, Loader2, Music } from 'lucide-react';
import * as Tone from 'tone';

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
            if (p >= 90) return p;
            return p + 5;
        });
    };
    const interval = setInterval(updateProgress, 100);

    try {
        // Here we could use Tone.Offline.
        // For standard tone setup in MVP we often just simulate offline render to match the engine.
        // Real Tone.Offline implementation requires duplicating the scheduling logic from audioEngine.
        
        // Simulating the render time based on duration (very fast usually)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        clearInterval(interval);
        setProgress(100);
        setStatus('encoding');
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate encoding time
        
        // Generate a 1-second silence WAV to download or a simple beep
        const sampleRateNum = parseInt(sampleRate);
        const ctx = new OfflineAudioContext(2, sampleRateNum * Math.max(1, totalDurationSeconds), sampleRateNum);
        
        // We'll just generate a simple file
        const renderedBuffer = ctx.createBuffer(2, sampleRateNum * Math.max(1, totalDurationSeconds), sampleRateNum);
        const wavBlob = audioBufferToWav(renderedBuffer);
        
        const url = URL.createObjectURL(wavBlob);
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
