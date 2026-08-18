/**
 * MIDI-IO-01/02: SMF Type 0/1 Import & Export
 * Uses midi-file@1.2.4 for byte-level SMF parsing/serialization.
 */
import { parseMidi, writeMidi, type MidiData, type MidiEvent } from 'midi-file';
import type { Note } from '../store/dawStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface MidiExportOptions {
  format: 0 | 1;
  ppq: number;
  tempo: number;
  timeSignature?: [number, number];
}

export interface MidiImportTrack {
  notes: Note[];
  channel: number;
}

export interface MidiImportResult {
  tracks: MidiImportTrack[];
  tempo: number;
  ppq: number;
  timeSignature: [number, number];
  format: 0 | 1;
}

function midiNoteToName(noteNumber: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(noteNumber)));
  return `${NOTE_NAMES[clamped % 12]}${Math.floor(clamped / 12) - 1}`;
}

function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const [, notePart, octaveStr] = match;
  const noteIndex = NOTE_NAMES.indexOf(notePart!);
  if (noteIndex === -1) return 60;
  const midi = (parseInt(octaveStr!) + 1) * 12 + noteIndex;
  return Math.max(0, Math.min(127, midi));
}

/**
 * Import SMF bytes into DuckDAW track/note model.
 */
export function importMidi(buffer: ArrayBuffer): MidiImportResult {
  const data = parseMidi(new Uint8Array(buffer));
  const format = data.header.format;

  if (format === 2) {
    throw new Error('SMF Type 2 files are not supported');
  }

  const ppq = data.header.ticksPerBeat;
  let tempo = 120;
  let timeSignature: [number, number] = [4, 4];

  // Extract tempo and time signature from first track (or only track for Type 0)
  const conductorTrack = data.tracks[0] ?? [];
  for (const event of conductorTrack) {
    if (event.type === 'setTempo' && 'microsecondsPerBeat' in event) {
      tempo = Math.round(60_000_000 / (event as any).microsecondsPerBeat);
    }
    if (event.type === 'timeSignature' && 'numerator' in event) {
      timeSignature = [(event as any).numerator, (event as any).denominator];
    }
  }

  const importedTracks: MidiImportTrack[] = [];

  if (format === 0) {
    // Type 0: single track containing all channels
    const notes = extractNotesFromTrack(conductorTrack, ppq);
    if (notes.length > 0 || data.tracks.length === 1) {
      const channel = notes.length > 0 ? guessChannel(conductorTrack) : 0;
      importedTracks.push({ notes, channel });
    }
  } else {
    // Type 1: first track is conductor, rest are note tracks
    for (let i = 1; i < data.tracks.length; i++) {
      const track = data.tracks[i];
      const notes = extractNotesFromTrack(track, ppq);
      const channel = guessChannel(track);
      importedTracks.push({ notes, channel });
    }
    // Filter out empty tracks that have no notes
    // But keep at least one if conductor has notes
    if (importedTracks.length === 0) {
      const conductorNotes = extractNotesFromTrack(conductorTrack, ppq);
      if (conductorNotes.length > 0) {
        importedTracks.push({ notes: conductorNotes, channel: 0 });
      }
    }
  }

  return {
    tracks: importedTracks,
    tempo,
    ppq,
    timeSignature,
    format: format as 0 | 1,
  };
}

function guessChannel(events: MidiEvent[]): number {
  for (const event of events) {
    if ((event.type === 'noteOn' || event.type === 'noteOff') && 'channel' in event) {
      return (event as any).channel;
    }
  }
  return 0;
}

interface ActiveNote {
  noteNumber: number;
  startTick: number;
  velocity: number;
  channel: number;
}

function extractNotesFromTrack(events: MidiEvent[], ppq: number): Note[] {
  const notes: Note[] = [];
  const active = new Map<string, ActiveNote>();
  let currentTick = 0;

  for (const event of events) {
    currentTick += event.deltaTime;

    if (event.type === 'noteOn' && 'noteNumber' in event) {
      const e = event as any;
      if (e.velocity > 0) {
        const key = `${e.channel}:${e.noteNumber}`;
        active.set(key, {
          noteNumber: e.noteNumber,
          startTick: currentTick,
          velocity: e.velocity,
          channel: e.channel,
        });
      } else {
        // noteOn with velocity 0 = noteOff
        finishNote(active, notes, `${e.channel}:${e.noteNumber}`, currentTick, ppq);
      }
    } else if (event.type === 'noteOff' && 'noteNumber' in event) {
      const e = event as any;
      finishNote(active, notes, `${e.channel}:${e.noteNumber}`, currentTick, ppq);
    }
  }

  // Close any remaining active notes at end
  for (const [key] of active) {
    finishNote(active, notes, key, currentTick, ppq);
  }

  return notes.sort((a, b) => a.start - b.start);
}

function finishNote(
  active: Map<string, ActiveNote>,
  notes: Note[],
  key: string,
  endTick: number,
  ppq: number,
): void {
  const a = active.get(key);
  if (!a) return;
  active.delete(key);

  const startBeat = a.startTick / ppq;
  const durationBeats = Math.max(1 / 64, (endTick - a.startTick) / ppq);

  notes.push({
    id: crypto.randomUUID(),
    note: midiNoteToName(a.noteNumber),
    start: startBeat,
    duration: durationBeats,
    velocity: a.velocity / 127,
  });
}

/**
 * Export DuckDAW tracks to SMF bytes.
 */
export function exportMidi(
  tracks: Array<{ notes: Note[]; channel: number }>,
  options: MidiExportOptions,
): Uint8Array {
  const { format, ppq, tempo, timeSignature = [4, 4] } = options;
  const microsecondsPerBeat = Math.round(60_000_000 / tempo);

  // Build conductor track
  const conductorEvents: MidiEvent[] = [
    {
      deltaTime: 0,
      type: 'setTempo',
      microsecondsPerBeat,
      meta: true,
    } as any,
    {
      deltaTime: 0,
      type: 'timeSignature',
      numerator: timeSignature[0],
      denominator: timeSignature[1],
      metronome: 24,
      thirtyseconds: 8,
      meta: true,
    } as any,
  ];

  if (format === 0) {
    // Type 0: merge all tracks into single track with conductor
    const allNoteEvents = buildNoteEvents(
      tracks.flatMap(t => t.notes.map(n => ({ ...n, channel: t.channel }))),
      ppq,
    );
    const mergedTrack = [...conductorEvents, ...allNoteEvents];
    mergedTrack.push({ deltaTime: 0, type: 'endOfTrack', meta: true } as any);

    const midiData: MidiData = {
      header: { format: 0, numTracks: 1, ticksPerBeat: ppq },
      tracks: [mergedTrack],
    };
    return new Uint8Array(writeMidi(midiData));
  }

  // Type 1: conductor + separate track per input track
  conductorEvents.push({ deltaTime: 0, type: 'endOfTrack', meta: true } as any);
  const midiTracks: MidiEvent[][] = [conductorEvents];

  for (const track of tracks) {
    const noteEvents = buildNoteEvents(
      track.notes.map(n => ({ ...n, channel: track.channel })),
      ppq,
    );
    noteEvents.push({ deltaTime: 0, type: 'endOfTrack', meta: true } as any);
    midiTracks.push(noteEvents);
  }

  const midiData: MidiData = {
    header: { format: 1, numTracks: midiTracks.length, ticksPerBeat: ppq },
    tracks: midiTracks,
  };
  return new Uint8Array(writeMidi(midiData));
}

interface NoteWithChannel extends Note {
  channel: number;
}

function buildNoteEvents(notes: NoteWithChannel[], ppq: number): MidiEvent[] {
  // Create noteOn/noteOff pairs and sort by absolute tick
  const events: Array<{ tick: number; event: MidiEvent }> = [];

  for (const note of notes) {
    const startTick = Math.round(note.start * ppq);
    const endTick = Math.round((note.start + note.duration) * ppq);
    const velocity = Math.round(note.velocity * 127);
    const noteNumber = noteNameToMidi(note.note);

    events.push({
      tick: startTick,
      event: {
        deltaTime: 0,
        type: 'noteOn',
        channel: note.channel,
        noteNumber,
        velocity,
      } as any,
    });
    events.push({
      tick: endTick,
      event: {
        deltaTime: 0,
        type: 'noteOff',
        channel: note.channel,
        noteNumber,
        velocity: 0,
      } as any,
    });
  }

  // Sort by tick (noteOff before noteOn at same tick for clean output)
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    // noteOff before noteOn at same tick
    const aIsOff = (a.event as any).type === 'noteOff' ? 0 : 1;
    const bIsOff = (b.event as any).type === 'noteOff' ? 0 : 1;
    return aIsOff - bIsOff;
  });

  // Convert absolute ticks to delta times
  let lastTick = 0;
  for (const item of events) {
    item.event.deltaTime = item.tick - lastTick;
    lastTick = item.tick;
  }

  return events.map(e => e.event);
}
