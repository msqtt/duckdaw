import * as Tone from 'tone';
import { Clip, Track } from '../store/dawStore';
import { beatsToTransportPosition, type TimeSignature } from './time';
import { MicRecorder } from './recorder';
import { createTrackMixSettings } from './mixSettings';
import { measurePerf } from './performance';
import { computeClipPlaybackPlan, createFadeValueCurve } from './audioEditing';
import { type TempoPoint, beatsToSecondsWithTempoMap } from './tempoMap';
import { evaluateAutomationAtBeat, generateAutomationSchedule, type AutomationLane } from './automation';

import { buildMixGraphPlan, type MixGraphPlan } from './mixGraph';
import type { Bus, Send } from './routingGraph';
class AudioEngine {
  synths: Map<string, Tone.PolySynth | Tone.Sampler>;
  audioPlayers: Map<string, Tone.Player>;
  clipGains: Map<string, Tone.Gain>;
  clipEnvelopeScheduleIds: Map<string, number>;
  channels: Map<string, Tone.Channel>;
  trackInputs: Map<string, Tone.Gain>;
  busInputs: Map<string, Tone.Gain>;
  busChannels: Map<string, Tone.Channel>;
  busOutputs: Map<string, Tone.Gain>;
  busEffectNodes: Map<string, Tone.ToneAudioNode[]>;
  sendGains: Map<string, Tone.Gain>;
  meters: Map<string, Tone.Meter>;
  partMap: Map<string, Tone.Part>;
  reverbs: Map<string, Tone.Reverb>;
  delays: Map<string, Tone.FeedbackDelay>;
  clipSignatures: Map<string, string>;
  currentClips: Clip[];
  metronome: Tone.MembraneSynth | null = null;
  cuteSynth: Tone.Synth | null = null;
  metronomeLoop: Tone.Loop | null = null;
  masterMeter: Tone.Meter | null = null;
  micRecorder: MicRecorder;
  timeSignature: TimeSignature;
  private tempoScheduleIds: number[] = [];
  private automationScheduleIds: Map<string, number[]> = new Map();
  private currentTempoTrack: TempoPoint[] = [];
  private currentRoutingPlan: MixGraphPlan | null = null;
  
  constructor() {
    this.synths = new Map();
    this.audioPlayers = new Map();
    this.clipGains = new Map();
    this.clipEnvelopeScheduleIds = new Map();
    this.channels = new Map();
    this.trackInputs = new Map();
    this.busInputs = new Map();
    this.busChannels = new Map();
    this.busOutputs = new Map();
    this.busEffectNodes = new Map();
    this.sendGains = new Map();
    this.meters = new Map();
    this.partMap = new Map();
    this.reverbs = new Map();
    this.delays = new Map();
    this.clipSignatures = new Map();
    this.currentClips = [];
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
    const changed = this.timeSignature[0] !== timeSignature[0] || this.timeSignature[1] !== timeSignature[1];
    this.timeSignature = timeSignature;
    Tone.Transport.timeSignature = timeSignature;
    if (changed && this.currentClips.length > 0) this.syncClips(this.currentClips);
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
      this.trackInputs.get(trackId)?.dispose();
      this.channels.get(trackId)?.dispose();
      this.meters.get(trackId)?.dispose();
      this.reverbs.get(trackId)?.dispose();
      this.delays.get(trackId)?.dispose();
      this.synths.delete(trackId);
      this.trackInputs.delete(trackId);
      this.channels.delete(trackId);
      this.meters.delete(trackId);
      this.reverbs.delete(trackId);
      this.delays.delete(trackId);
    }

    tracks.forEach(track => {
      const mix = createTrackMixSettings(track);
      if (!this.channels.has(track.id)) {
        const input = new Tone.Gain(1);
        const channel = new Tone.Channel();
        const meter = new Tone.Meter();
        const reverb = new Tone.Reverb(2);
        const delay = new Tone.FeedbackDelay("8n", 0.3);

        reverb.wet.value = 0;
        delay.wet.value = 0;
        input.connect(channel);
        channel.chain(delay, reverb, meter);

        this.trackInputs.set(track.id, input);
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
        
        synth.connect(this.trackInputs.get(track.id)!);
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

  syncRouting(tracks: Track[], buses: Bus[], sends: Send[]): void {
    const rootBusId = buses.find(bus => bus.outputBusId == null)?.id;
    if (!rootBusId) throw new Error('Routing requires one destination bus');
    const routingTracks = tracks.map(track => ({
      id: track.id,
      outputBusId: track.outputBusId ?? rootBusId,
    }));
    const plan = buildMixGraphPlan(routingTracks, buses, sends);

    for (const meter of this.meters.values()) meter.disconnect?.();
    for (const gain of this.sendGains.values()) gain.dispose();
    for (const nodes of this.busEffectNodes.values()) nodes.forEach(node => node.dispose());
    for (const input of this.busInputs.values()) input.dispose();
    for (const channel of this.busChannels.values()) channel.dispose();
    for (const output of this.busOutputs.values()) output.dispose();
    this.sendGains.clear();
    this.busEffectNodes.clear();
    this.busInputs.clear();
    this.busChannels.clear();
    this.busOutputs.clear();

    for (const bus of buses) {
      const input = new Tone.Gain(1);
      const channel = new Tone.Channel();
      const output = new Tone.Gain(1);
      channel.volume.value = bus.volume === 0 ? -Infinity : 20 * Math.log10(bus.volume);
      channel.pan.value = bus.pan;
      channel.mute = bus.isMuted;
      input.connect(channel);

      let tail: Tone.ToneAudioNode = channel;
      const effectNodes: Tone.ToneAudioNode[] = [];
      for (const effect of bus.effects) {
        if (!effect.enabled) continue;
        let node: Tone.ToneAudioNode;
        if (effect.type === 'reverb') {
          node = new Tone.Reverb(effect.parameters.decay ?? 2);
        } else if (effect.type === 'delay') {
          node = new Tone.FeedbackDelay(effect.parameters.delayTime ?? 0.25, effect.parameters.feedback ?? 0.3);
        } else {
          node = new Tone.Limiter(effect.parameters.threshold ?? -1);
        }
        tail.connect(node);
        tail = node;
        effectNodes.push(node);
      }
      tail.connect(output);
      this.busInputs.set(bus.id, input);
      this.busChannels.set(bus.id, channel);
      this.busOutputs.set(bus.id, output);
      this.busEffectNodes.set(bus.id, effectNodes);
    }

    const endpoint = (id: string): Tone.ToneAudioNode | typeof Tone.Destination | undefined => {
      if (id === 'destination') return Tone.Destination;
      const trackMatch = /^track:(.+):(pre|post)$/.exec(id);
      if (trackMatch) return trackMatch[2] === 'pre'
        ? this.trackInputs.get(trackMatch[1])
        : this.meters.get(trackMatch[1]);
      const busMatch = /^bus:(.+):(input|pre|post)$/.exec(id);
      if (busMatch) return busMatch[2] === 'post'
        ? this.busOutputs.get(busMatch[1])
        : this.busInputs.get(busMatch[1]);
      return undefined;
    };

    for (const edge of plan.edges) {
      const source = endpoint(edge.from);
      const target = endpoint(edge.to);
      if (!source || !target) throw new Error(`Routing endpoint missing for ${edge.id}`);
      if (edge.kind === 'output') {
        source.connect(target as Tone.InputNode);
      } else {
        const gain = new Tone.Gain(edge.gain);
        source.connect(gain);
        gain.connect(target as Tone.InputNode);
        this.sendGains.set(edge.id, gain);
      }
    }
    this.currentRoutingPlan = plan;
  }

  getRoutingPlan(): MixGraphPlan | null {
    return this.currentRoutingPlan == null
      ? null
      : JSON.parse(JSON.stringify(this.currentRoutingPlan)) as MixGraphPlan;
  }

  private getClipSignature(clip: Clip): string {
    return JSON.stringify({
      trackId: clip.trackId,
      type: clip.type,
      start: clip.start,
      duration: clip.duration,
      bufferUrl: clip.bufferUrl,
      audioEdit: clip.audioEdit,
      activeTakeId: clip.activeTakeId,
      notes: clip.notes,
      timeSignature: this.timeSignature,
      tempoTrack: this.currentTempoTrack,
    });
  }

  private disposeClipSchedule(clipId: string): void {
    this.partMap.get(clipId)?.dispose();
    this.audioPlayers.get(clipId)?.dispose();
    this.clipGains.get(clipId)?.dispose();
    const envelopeScheduleId = this.clipEnvelopeScheduleIds.get(clipId);
    if (envelopeScheduleId != null) Tone.Transport.clear(envelopeScheduleId);
    this.partMap.delete(clipId);
    this.audioPlayers.delete(clipId);
    this.clipGains.delete(clipId);
    this.clipEnvelopeScheduleIds.delete(clipId);
    this.clipSignatures.delete(clipId);
  }

  syncClips(clips: Clip[]) {
    measurePerf('clip-sync', () => {
    this.currentClips = clips.map(clip => ({ ...clip, notes: clip.notes.map(note => ({ ...note })) }));
    const nextIds = new Set(clips.map(clip => clip.id));
    for (const clipId of this.clipSignatures.keys()) {
      if (!nextIds.has(clipId)) this.disposeClipSchedule(clipId);
    }

    clips.forEach(clip => {
      const signature = this.getClipSignature(clip);
      if (this.clipSignatures.get(clip.id) === signature) return;
      this.disposeClipSchedule(clip.id);
      const startTime = beatsToTransportPosition(clip.start, this.timeSignature);

      if (clip.type === 'midi' && clip.notes) {
        const synth = this.synths.get(clip.trackId);
        if (!synth) return;
        const events = clip.notes
          .filter(note => note.start < clip.duration)
          .map(note => ({
            time: `0:${note.start}`,
            note: note.note,
            duration: `0:${Math.min(note.duration, clip.duration - note.start)}`,
            velocity: note.velocity,
          }));
        const part = new Tone.Part((time, value) => {
          synth.triggerAttackRelease(value.note, value.duration, time, value.velocity);
        }, events);
        part.start(startTime);
        this.partMap.set(clip.id, part);
        this.clipSignatures.set(clip.id, signature);
        return;
      }

      if (clip.type === 'audio' && clip.bufferUrl) {
        const trackInput = this.trackInputs.get(clip.trackId);
        if (!trackInput) return;
        try {
          const timing = this.currentTempoTrack.length > 0
            ? this.currentTempoTrack
            : [{ id: 'default', beat: 0, bpm: Tone.Transport.bpm.value, curve: 'step' as const }];
          const initialPlan = computeClipPlaybackPlan(clip, timing);
          const fadeGain = new Tone.Gain(initialPlan.fadeInSeconds > 0 ? 0 : 1).connect(trackInput);
          const player = new Tone.Player({
            url: clip.bufferUrl,
            volume: initialPlan.gainDb,
            fadeIn: 0,
            fadeOut: 0,
            reverse: initialPlan.reversed,
            onload: () => {
              if (this.audioPlayers.get(clip.id) !== player) return;
              const plan = computeClipPlaybackPlan(clip, timing, player.buffer.duration);
              const envelopeScheduleId = Tone.Transport.scheduleOnce(time => {
                fadeGain.gain.cancelScheduledValues(time);
                if (plan.fadeInSeconds > 0) {
                  fadeGain.gain.setValueCurveAtTime(
                    createFadeValueCurve(plan.fadeInCurve, 'in'),
                    time,
                    plan.fadeInSeconds,
                  );
                } else {
                  fadeGain.gain.setValueAtTime(1, time);
                }
                if (plan.fadeOutSeconds > 0) {
                  fadeGain.gain.setValueCurveAtTime(
                    createFadeValueCurve(plan.fadeOutCurve, 'out'),
                    time + plan.durationSeconds - plan.fadeOutSeconds,
                    plan.fadeOutSeconds,
                  );
                }
              }, startTime);
              this.clipEnvelopeScheduleIds.set(clip.id, envelopeScheduleId);
              player.sync().start(startTime, plan.sourceOffsetSeconds, plan.durationSeconds);
            },
          }).connect(fadeGain);
          this.audioPlayers.set(clip.id, player);
          this.clipGains.set(clip.id, fadeGain);
          this.clipSignatures.set(clip.id, signature);
        } catch {
          this.disposeClipSchedule(clip.id);
        }
      }
    });
    });
  }

  /**
   * Sync the transport tempo with the tempo map.
   * For step changes: schedules BPM changes at the correct transport times.
   * For linear changes: uses Tone.Transport.bpm.linearRampTo.
   * Clears all previous tempo schedules to avoid leaks.
   */
  syncTempoTrack(tempoTrack: TempoPoint[]) {
    // Clear previous tempo schedules
    for (const id of this.tempoScheduleIds) {
      Tone.Transport.clear(id);
    }
    Tone.Transport.bpm.cancelScheduledValues?.(0);
    this.tempoScheduleIds = [];
    const nextTempoTrack = tempoTrack.map(point => ({ ...point }));
    const tempoChanged = JSON.stringify(this.currentTempoTrack) !== JSON.stringify(nextTempoTrack);
    this.currentTempoTrack = nextTempoTrack;

    if (nextTempoTrack.length === 0) return;

    // Set initial BPM immediately
    Tone.Transport.bpm.value = nextTempoTrack[0].bpm;

    // Schedule tempo changes for subsequent points
    for (let i = 0; i < nextTempoTrack.length - 1; i++) {
      const current = nextTempoTrack[i];
      const next = nextTempoTrack[i + 1];
      const nextTimeStr = beatsToTransportPosition(next.beat, this.timeSignature);

      if (current.curve === 'step') {
        // Schedule an instant BPM change at the next point's time
        const scheduleId = Tone.Transport.schedule((time) => {
          Tone.Transport.bpm.setValueAtTime(next.bpm, time);
        }, nextTimeStr);
        this.tempoScheduleIds.push(scheduleId);
      } else if (current.curve === 'linear') {
        // Schedule a linear ramp from current point to next point
        const startTimeStr = beatsToTransportPosition(current.beat, this.timeSignature);
        const durationSeconds = beatsToSecondsWithTempoMap(next.beat, tempoTrack) - beatsToSecondsWithTempoMap(current.beat, tempoTrack);
        const scheduleId = Tone.Transport.schedule((time) => {
          Tone.Transport.bpm.linearRampTo(next.bpm, durationSeconds, time);
        }, startTimeStr);
        this.tempoScheduleIds.push(scheduleId);
      }
    }

    if (tempoChanged && this.currentClips.length > 0) {
      this.syncClips(this.currentClips);
    }
  }

  /**
   * Schedule automation for a set of tracks.
   * Uses evaluateAutomationAtBeat for initial values and schedules
   * parameter ramps for enabled lanes.
   * Clears previous automation schedules for the given tracks.
   */
  syncAutomation(tracks: Track[]) {
    // Clear all previous automation schedules
    for (const [, ids] of this.automationScheduleIds) {
      for (const id of ids) {
        Tone.Transport.clear(id);
      }
    }
    this.automationScheduleIds.clear();

    for (const track of tracks) {
      if (!track.automationLanes || track.automationLanes.length === 0) continue;

      const channel = this.channels.get(track.id);
      const reverb = this.reverbs.get(track.id);
      const delay = this.delays.get(track.id);
      if (!channel) continue;

      const scheduleIds: number[] = [];

      for (const lane of track.automationLanes) {
        if (!lane.enabled || lane.points.length === 0) continue;

        // Apply the initial value only after clearing any previously executed AudioParam ramps.
        this.cancelAutomationValues(track.id, lane.target);
        const initialValue = evaluateAutomationAtBeat(lane.points, 0);
        this.applyAutomationValue(track.id, lane.target, initialValue);

        // Generate and schedule the automation plan
        const toSeconds = (beat: number) => beatsToSecondsWithTempoMap(beat, this.currentTempoTrack.length > 0 ? this.currentTempoTrack : [{ id: 'default', beat: 0, bpm: Tone.Transport.bpm.value, curve: 'step' as const }]);
        const maxBeat = lane.points[lane.points.length - 1].beat + 1;
        const schedule = generateAutomationSchedule(lane.points, toSeconds, 0, maxBeat);

        for (let index = 1; index < schedule.length; index += 1) {
          const previous = schedule[index - 1];
          const entry = schedule[index];
          const scheduleAt = entry.rampType === 'set' ? entry.time : previous.time;
          const rampDuration = Math.max(0, entry.time - scheduleAt);
          const scheduleId = Tone.Transport.schedule((time) => {
            this.scheduleAutomationEntry(
              track.id,
              lane.target,
              entry.value,
              entry.rampType,
              time + rampDuration,
            );
          }, scheduleAt);
          scheduleIds.push(scheduleId);
        }
      }

      if (scheduleIds.length > 0) {
        this.automationScheduleIds.set(track.id, scheduleIds);
      }
    }
  }

  private getAutomationParam(trackId: string, target: string): any {
    switch (target) {
      case 'volume': return this.channels.get(trackId)?.volume;
      case 'pan': return this.channels.get(trackId)?.pan;
      case 'reverb': return this.reverbs.get(trackId)?.wet;
      case 'delay': return this.delays.get(trackId)?.wet;
      case 'masterVolume': return Tone.Destination.volume;
      default: return undefined;
    }
  }

  private cancelAutomationValues(trackId: string, target: string): void {
    this.getAutomationParam(trackId, target)?.cancelScheduledValues?.(0);
  }

  private applyAutomationValue(trackId: string, target: string, value: number): void {
    const param = this.getAutomationParam(trackId, target);
    if (!param) return;
    param.value = target === 'volume' || target === 'masterVolume'
      ? (value === 0 ? -Infinity : 20 * Math.log10(value))
      : value;
  }

  private scheduleAutomationEntry(trackId: string, target: string, value: number, rampType: 'set' | 'linear' | 'exponential', time: number) {
    const param = this.getAutomationParam(trackId, target);
    if (!param) return;

    const isDecibels = target === 'volume' || target === 'masterVolume';
    const parameterValue = isDecibels
      ? (value === 0 ? -Infinity : 20 * Math.log10(value))
      : value;

    switch (rampType) {
      case 'set':
        param.setValueAtTime(parameterValue, time);
        break;
      case 'linear':
        param.linearRampToValueAtTime(parameterValue, time);
        break;
      case 'exponential':
        if (value <= 0) {
          param.setValueAtTime(parameterValue, time);
        } else if (isDecibels) {
          // Geometric amplitude interpolation is linear in decibels.
          param.linearRampToValueAtTime(parameterValue, time);
        } else {
          param.exponentialRampToValueAtTime(value, time);
        }
        break;
    }
  }

  /**
   * Get a beat→seconds function using the current tempo map.
   * This is the shared pure API for offline render planning.
   */
  getBeatsToSeconds(): (beat: number) => number {
    const tempoMap = this.currentTempoTrack.length > 0
      ? this.currentTempoTrack
      : [{ id: 'default', beat: 0, bpm: Tone.Transport.bpm.value, curve: 'step' as const }];
    return (beat: number) => beatsToSecondsWithTempoMap(beat, tempoMap);
  }
}

export const engine = new AudioEngine();
