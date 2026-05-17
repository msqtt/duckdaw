import * as Tone from 'tone';
import { Clip, Track } from '../store/dawStore';

class AudioEngine {
  synths: Map<string, Tone.PolySynth | Tone.Sampler>;
  audioPlayers: Map<string, Tone.Player>;
  channels: Map<string, Tone.Channel>;
  meters: Map<string, Tone.Meter>;
  partMap: Map<string, Tone.Part>;
  reverbs: Map<string, Tone.Reverb>;
  delays: Map<string, Tone.FeedbackDelay>;
  metronome: Tone.MembraneSynth | null = null;
  metronomeLoop: Tone.Loop | null = null;
  
  constructor() {
    this.synths = new Map();
    this.audioPlayers = new Map();
    this.channels = new Map();
    this.meters = new Map();
    this.partMap = new Map();
    this.reverbs = new Map();
    this.delays = new Map();
  }

  getMeter(trackId: string): Tone.Meter | undefined {
      return this.meters.get(trackId);
  }

  async initialize() {
    await Tone.start();
    Tone.Transport.bpm.value = 120;
    Tone.Transport.loop = false;
    
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

  setMetronome(enabled: boolean) {
     if (enabled && this.metronomeLoop) {
         this.metronomeLoop.start(0);
     } else if (this.metronomeLoop) {
         this.metronomeLoop.stop();
     }
  }

  setLoop(enabled: boolean, startBeat: number, endBeat: number) {
     Tone.Transport.loop = enabled;
     // Convert beats to bars:beats:sixteenths
     const startM = Math.floor(startBeat / 4);
     const startB = startBeat % 4;
     Tone.Transport.loopStart = `${startM}:${startB}:0`;
     
     const endM = Math.floor(endBeat / 4);
     const endB = endBeat % 4;
     Tone.Transport.loopEnd = `${endM}:${endB}:0`;
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
    tracks.forEach(track => {
      if (!this.channels.has(track.id)) {
        const channel = new Tone.Channel().toDestination();
        const meter = new Tone.Meter();
        
        const reverb = new Tone.Reverb(2);
        const delay = new Tone.FeedbackDelay("8n", 0.3);
        
        reverb.wet.value = 0;
        delay.wet.value = 0;
        
        channel.chain(delay, reverb, meter);
        
        this.channels.set(track.id, channel);
        this.meters.set(track.id, meter);
        this.reverbs.set(track.id, reverb);
        this.delays.set(track.id, delay);
      }
      
      const reverb = this.reverbs.get(track.id);
      if (reverb) reverb.wet.value = track.reverb || 0;
      const delay = this.delays.get(track.id);
      if (delay) delay.wet.value = track.delay || 0;
      
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
      channel.volume.value = track.volume === 0 ? -Infinity : 20 * Math.log10(track.volume);
      channel.pan.value = track.pan;
      channel.mute = track.isMuted;
      channel.solo = track.isSolo;
    });
  }

  syncClips(clips: Clip[]) {
    this.partMap.forEach(part => part.dispose());
    this.partMap.clear();
    
    this.audioPlayers.forEach(p => p.dispose());
    this.audioPlayers.clear();

    clips.forEach(clip => {
      // Calculate clip start in transport time
      const startMeasure = Math.floor(clip.start / 4);
      const startBeat = clip.start % 4;
      const startTime = `${startMeasure}:${startBeat}:0`;

      if (clip.type === 'midi' && clip.notes) {
        const synth = this.synths.get(clip.trackId);
        if (!synth) return;

        const events = clip.notes.map(note => ({
          time: `0:${note.start}`,
          note: note.note,
          duration: `0:${note.duration}`,
          velocity: note.velocity
        }));

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
                    player.sync().start(startTime);
                 }
             }).connect(channel);
             this.audioPlayers.set(clip.id, player);
          } catch(e) { }
      }
    });
  }
}

export const engine = new AudioEngine();
