/**
 * MIDI-EDIT-01/02: Velocity Lane + Transpose/Humanize/Legato
 * Pure functions operating on Note arrays. Seeded RNG for deterministic humanize.
 */
import type { Note } from '../store/dawStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface HumanizeOptions {
  amount: number; // max offset in beats (0 = none)
  seed: number;   // RNG seed for deterministic output
}

export interface TransformOptions {
  velocity?: number;          // set absolute velocity (0-1)
  transpose?: number;         // semitones (+/-)
  humanize?: HumanizeOptions; // timing randomization
  legato?: boolean;           // extend to next selected note
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns values in [-1, 1].
 */
function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return u * 2 - 1; // map [0,1] to [-1,1]
  };
}

function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const [, notePart, octaveStr] = match;
  const noteIndex = NOTE_NAMES.indexOf(notePart!);
  if (noteIndex === -1) return 60;
  return Math.max(0, Math.min(127, (parseInt(octaveStr!) + 1) * 12 + noteIndex));
}

function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, midi));
  return `${NOTE_NAMES[clamped % 12]}${Math.floor(clamped / 12) - 1}`;
}

/**
 * Transform notes with the given options. Only notes in selectedIds are affected.
 * Returns a new array (all notes are copied).
 */
export function transformNotes(
  notes: Note[],
  selectedIds: string[],
  options: TransformOptions,
): Note[] {
  const selectedSet = new Set(selectedIds);
  let result = notes.map(n => ({ ...n }));

  // 1. Velocity
  if (options.velocity !== undefined) {
    const v = Math.max(0, Math.min(1, options.velocity));
    result = result.map(n => selectedSet.has(n.id) ? { ...n, velocity: v } : n);
  }

  // 2. Transpose
  if (options.transpose !== undefined && options.transpose !== 0) {
    result = result.map(n => {
      if (!selectedSet.has(n.id)) return n;
      const midi = noteNameToMidi(n.note) + options.transpose!;
      const clamped = Math.max(0, Math.min(127, midi));
      return { ...n, note: midiToNoteName(clamped) };
    });
  }

  // 3. Humanize (must come before legato since legato depends on start positions)
  if (options.humanize && options.humanize.amount > 0) {
    const rng = createSeededRng(options.humanize.seed);
    result = result.map(n => {
      if (!selectedSet.has(n.id)) return n;
      const offset = rng() * options.humanize!.amount;
      return { ...n, start: Math.max(0, n.start + offset) };
    });
  }

  // 4. Legato: extend each selected note to the start of the next selected note
  if (options.legato) {
    // Get selected notes sorted by start time
    const selectedSorted = result
      .filter(n => selectedSet.has(n.id))
      .sort((a, b) => a.start - b.start);

    const legatoMap = new Map<string, number>();
    for (let i = 0; i < selectedSorted.length - 1; i++) {
      const current = selectedSorted[i];
      const next = selectedSorted[i + 1];
      legatoMap.set(current.id, next.start - current.start);
    }

    result = result.map(n => {
      const newDuration = legatoMap.get(n.id);
      if (newDuration !== undefined && newDuration > 0) {
        return { ...n, duration: newDuration };
      }
      return n;
    });
  }

  return result;
}
