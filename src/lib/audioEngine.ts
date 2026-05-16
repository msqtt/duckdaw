import * as Tone from 'tone';
import { Clip, Track } from '../store/dawStore';

class AudioEngine {
  synths: Map<string, Tone.PolySynth | Tone.Sampler>;
  channels: Map<string, Tone.Channel>;
  partMap: Map<string, Tone.Part>;
  
  constructor() {
    this.synths = new Map();
    this.channels = new Map();
    this.partMap = new Map();
  }

  async initialize() {
    await Tone.start();
    Tone.Transport.bpm.value = 120;
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = "4m"; // 4 bars loop by default
  }

  setBpm(bpm: number) {
    Tone.Transport.bpm.value = bpm;
  }

  play() {
    if (Tone.context.state !== 'running') {
      Tone.context.resume();
    }
    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
  }

  pause() {
    Tone.Transport.pause();
  }
  
  syncTracks(tracks: Track[]) {
    // Basic sync: create synths and channels if they don't exist
    tracks.forEach(track => {
      if (!this.channels.has(track.id)) {
        const channel = new Tone.Channel().toDestination();
        this.channels.set(track.id, channel);
      }
      
      if (track.type === 'midi' && !this.synths.has(track.id)) {
        let synth;
        switch(track.instrument) {
          case 'piano':
             // Basic placeholder for piano, using a poly synth for now, since sampler requires loading samples
             synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.02, decay: 1, sustain: 0.4, release: 1 }
             });
             break;
          case 'bass':
             synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 1 }
             });
             break;
          case 'drum':
             // PolySynth isn't great for drums but just for MVP
             synth = new Tone.PolySynth(Tone.MembraneSynth);
             break;
          case 'synth':
          default:
             synth = new Tone.PolySynth(Tone.Synth, {
                 oscillator: { type: 'square' },
                 envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 }
             });
             break;
        }
        
        synth.connect(this.channels.get(track.id)!);
        this.synths.set(track.id, synth);
      }
      
      // Update channel volume/pan
      const channel = this.channels.get(track.id)!;
      // Volume from 0-1 to dB (-60 to 0 approx)
      channel.volume.value = track.volume === 0 ? -Infinity : 20 * Math.log10(track.volume);
      channel.pan.value = track.pan;
      channel.mute = track.isMuted;
      channel.solo = track.isSolo;
    });
  }

  syncClips(clips: Clip[]) {
    // Clear old parts
    this.partMap.forEach(part => part.dispose());
    this.partMap.clear();

    clips.forEach(clip => {
      if (clip.type === 'midi' && clip.notes) {
        const synth = this.synths.get(clip.trackId);
        if (!synth) return;

        // Convert notes to Tone.js format
        const events = clip.notes.map(note => ({
          time: `0:${note.start}`,        // in quarters starting from clip start
          note: note.note,
          duration: `0:${note.duration}`, // in quarters
          velocity: note.velocity
        }));

        const part = new Tone.Part((time, value) => {
          synth.triggerAttackRelease(value.note, value.duration, time, value.velocity);
        }, events);

        // Calculate clip start in transport time (e.g., '0:0:0' + beats)
        const startMeasure = Math.floor(clip.start / 4);
        const startBeat = clip.start % 4;
        
        part.start(`${startMeasure}:${startBeat}:0`);
        this.partMap.set(clip.id, part);
      }
    });
  }
}

export const engine = new AudioEngine();
