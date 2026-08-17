import * as Tone from 'tone';
import { Clip, Track } from '../store/dawStore';
import { beatsToTransportPosition, type TimeSignature } from './time';
import { MicRecorder } from './recorder';
import { createTrackMixSettings } from './mixSettings';

class AudioEngine {
  synths: Map<string, Tone.PolySynth | Tone.Sampler>;
  audioPlayers: Map<string, Tone.Player>;
  channels: Map<string, Tone.Channel>;
  meters: Map<string, Tone.Meter>;
  partMap: Map<string, Tone.Part>;
  reverbs: Map<string, Tone.Reverb>;
  delays: Map<string, Tone.FeedbackDelay>;
  metronome: Tone.MembraneSynth | null = null;
  cuteSynth: Tone.Synth | null = null;
  metronomeLoop: Tone.Loop | null = null;
  masterMeter: Tone.Meter | null = null;
  micRecorder: MicRecorder;
  timeSignature: TimeSignature;
  
  constructor() {
    this.synths = new Map();
    this.audioPlayers = new Map();
    this.channels = new Map();
    this.meters = new Map();
    this.partMap = new Map();
    this.reverbs = new Map();
    this.delays = new Map();
    this.micRecorder = new MicRecorder();
    this.timeSignature = [4, 4];
    
    this.masterMeter = new Tone.Meter();
    Tone.Destination.connect(this.masterMeter);
  }

  getMeter(trackId: string): Tone.Meter | undefined {
      return this.meters.get(trackId);
  }

  async initialize() {
    await Tone.start();
    
    if (!this.metronome) {
        this.metronome = new Tone.MembraneSynth({ pitchDecay: 0.008, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } }).toDestination();
        this.metronomeLoop = new Tone.Loop((time) => {
            const pos = Tone.Transport.position.toString().split(':');
            if (pos[1] === '0') {
               this.metronome?.triggerAttackRelease("C4", "8n", time, 1);
            } else {
               this.metronome?.triggerAttackRelease("C3", "8n", time, 0.5);
            }
        }, "4n");
    }
  }

  setBpm(bpm: number) {
    Tone.Transport.bpm.value = bpm;
  }

  setTimeSignature(timeSignature: TimeSignature) {
    this.timeSignature = timeSignature;
    Tone.Transport.timeSignature = timeSignature;
  }

  setMetronome(enabled: boolean, sound: string = 'click', volume: number = 0.8, subdivisions: number = 1) {
    if (!this.metronome) {
        this.metronome = new Tone.MembraneSynth({ pitchDecay: 0.008, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } }).toDestination();
    }
    if (!this.cuteSynth) {
        this.cuteSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }
        }).toDestination();
    }

    this.metronome.volume.value = volume === 0 ? -Infinity : 20 * Math.log10(volume);
    if (this.cuteSynth) this.cuteSynth.volume.value = volume === 0 ? -Infinity : 20 * Math.log10(volume) + 5; // boost slightly

     let subString = "4n";
     if (subdivisions === 2) subString = "8n";
     if (subdivisions === 4) subString = "16n";

     if (this.metronomeLoop) {
         this.metronomeLoop.dispose();
     }

     this.metronomeLoop = new Tone.Loop((time) => {
         const pos = Tone.Transport.position.toString().split(':');
         const beats = parseInt(pos[1]);
         const sixteenths = parseFloat(pos[2]);

         let highClick = false;
         if (beats === 0 && sixteenths < 0.1) highClick = true;

         let pitchHigh = "C4";
         let pitchLow = "C3";
         
         let isCute = false;
         
         if (sound === 'woodblock') {
             pitchHigh = "G5";
             pitchLow = "C5";
         } else if (sound === 'electronic') {
             pitchHigh = "C6";
             pitchLow = "C5";
         } else if (sound === 'cute') {
             pitchHigh = "E6"; // higher cute pop
             pitchLow = "A5";  // lower cute pop
             isCute = true;
         }

         if (highClick) {
            if (isCute) {
                this.cuteSynth?.triggerAttackRelease(pitchHigh, "32n", time, 1);
            } else {
                this.metronome?.triggerAttackRelease(pitchHigh, "32n", time, 1);
            }
         } else {
            if (isCute) {
                this.cuteSynth?.triggerAttackRelease(pitchLow, "32n", time, 0.5);
            } else {
                this.metronome?.triggerAttackRelease(pitchLow, "32n", time, 0.5);
            }
         }
     }, subString);

     if (enabled) {
         this.metronomeLoop.start(0);
     } else {
         this.metronomeLoop.stop();
     }
  }

  setLoop(enabled: boolean, startBeat: number, endBeat: number) {
     Tone.Transport.loop = enabled;
     Tone.Transport.loopStart = beatsToTransportPosition(startBeat, this.timeSignature);
     Tone.Transport.loopEnd = beatsToTransportPosition(endBeat, this.timeSignature);
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

  setMasterVolume(volume: number) {
      Tone.Destination.volume.value = volume === 0 ? -Infinity : 20 * Math.log10(volume);
  }
  
  syncTracks(tracks: Track[]) {
    const activeTrackIds = new Set(tracks.map(track => track.id));
    for (const trackId of this.channels.keys()) {
      if (activeTrackIds.has(trackId)) continue;
      this.synths.get(trackId)?.dispose();
      this.channels.get(trackId)?.dispose();
      this.meters.get(trackId)?.dispose();
      this.reverbs.get(trackId)?.dispose();
      this.delays.get(trackId)?.dispose();
      this.synths.delete(trackId);
      this.channels.delete(trackId);
      this.meters.delete(trackId);
      this.reverbs.delete(trackId);
      this.delays.delete(trackId);
    }

    tracks.forEach(track => {
      const mix = createTrackMixSettings(track);
      if (!this.channels.has(track.id)) {
        const channel = new Tone.Channel();
        const meter = new Tone.Meter();
        
        const reverb = new Tone.Reverb(2);
        const delay = new Tone.FeedbackDelay("8n", 0.3);
        
        reverb.wet.value = 0;
        delay.wet.value = 0;
        
        channel.chain(delay, reverb, meter, Tone.Destination);
        
        this.channels.set(track.id, channel);
        this.meters.set(track.id, meter);
        this.reverbs.set(track.id, reverb);
        this.delays.set(track.id, delay);
      }
      
      const reverb = this.reverbs.get(track.id);
      if (reverb) reverb.wet.value = mix.reverbWet;
      const delay = this.delays.get(track.id);
      if (delay) delay.wet.value = mix.delayWet;
      
      if (track.type === 'midi' && !this.synths.has(track.id)) {
        let synth;
        switch(track.instrument) {
          case 'piano':
             synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: track.env || { attack: 0.02, decay: 1, sustain: 0.4, release: 1 }
             });
             break;
          case 'bass':
             synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sawtooth' },
                envelope: track.env || { attack: 0.05, decay: 0.3, sustain: 0.2, release: 1 }
             });
             break;
          case 'drum':
             synth = new Tone.PolySynth(Tone.MembraneSynth);
             break;
          case 'synth':
          default:
             synth = new Tone.PolySynth(Tone.Synth, {
                 oscillator: { type: 'square' },
                 envelope: track.env || { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 }
             });
             break;
        }
        
        synth.connect(this.channels.get(track.id)!);
        this.synths.set(track.id, synth);
      } else if (track.type === 'midi' && this.synths.has(track.id)) {
          // Update env if it's a polysynth using Tone.Synth
          const synth = this.synths.get(track.id);
          if (track.env && synth && (synth as any).set) {
              try {
                (synth as Tone.PolySynth).set({ envelope: track.env });
              } catch(e) {}
          }
      }
      
      const channel = this.channels.get(track.id)!;
      channel.volume.value = mix.volumeDb;
      channel.pan.value = mix.pan;
      channel.mute = mix.muted;
      channel.solo = mix.solo;
    });
  }

  syncClips(clips: Clip[]) {
    this.partMap.forEach(part => part.dispose());
    this.partMap.clear();
    
    this.audioPlayers.forEach(p => p.dispose());
    this.audioPlayers.clear();

    clips.forEach(clip => {
      const startTime = beatsToTransportPosition(clip.start, this.timeSignature);

      if (clip.type === 'midi' && clip.notes) {
        const synth = this.synths.get(clip.trackId);
        if (!synth) return;

        const events = clip.notes
          .filter(n => n.start < clip.duration)
          .map(note => {
            const clampedDur = Math.min(note.duration, clip.duration - note.start);
            return {
              time: `0:${note.start}`,
              note: note.note,
              duration: `0:${clampedDur}`,
              velocity: note.velocity
            };
          });

        const part = new Tone.Part((time, value) => {
          synth.triggerAttackRelease(value.note, value.duration, time, value.velocity);
        }, events);
        
        part.start(startTime);
        this.partMap.set(clip.id, part);
      } else if (clip.type === 'audio' && clip.bufferUrl) {
          const channel = this.channels.get(clip.trackId);
          if (!channel) return;
          
          try {
             const player = new Tone.Player({
                 url: clip.bufferUrl,
                 onload: () => {
                    player.sync().start(startTime, 0, `0:${clip.duration}:0`);
                 }
             }).connect(channel);
             this.audioPlayers.set(clip.id, player);
          } catch(e) { }
      }
    });
  }
}

export const engine = new AudioEngine();
