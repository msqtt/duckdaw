import { describe, it, expect } from 'vitest';
import {
  transformNotes,
  type TransformOptions,
} from './midiEditing';
import type { Note } from '../store/dawStore';

const sampleNotes: Note[] = [
  { id: 'n1', note: 'C4', start: 0, duration: 1, velocity: 0.8 },
  { id: 'n2', note: 'E4', start: 1, duration: 1, velocity: 0.6 },
  { id: 'n3', note: 'G4', start: 2, duration: 0.5, velocity: 0.9 },
  { id: 'n4', note: 'B4', start: 3, duration: 1.5, velocity: 0.7 },
];

describe('MIDI-EDIT-01: Velocity Lane', () => {
  it('sets velocity for a single note', () => {
    const result = transformNotes(sampleNotes, ['n1'], { velocity: 0.5 });
    expect(result[0].velocity).toBe(0.5);
    expect(result[1].velocity).toBe(0.6); // unchanged
  });

  it('clamps velocity to 0-1 range', () => {
    const result = transformNotes(sampleNotes, ['n1'], { velocity: 1.5 });
    expect(result[0].velocity).toBe(1);
    const result2 = transformNotes(sampleNotes, ['n1'], { velocity: -0.1 });
    expect(result2[0].velocity).toBe(0);
  });

  it('sets velocity for multiple selected notes', () => {
    const result = transformNotes(sampleNotes, ['n1', 'n3'], { velocity: 0.4 });
    expect(result[0].velocity).toBe(0.4);
    expect(result[1].velocity).toBe(0.6); // unchanged
    expect(result[2].velocity).toBe(0.4);
  });
});

describe('MIDI-EDIT-02: Transpose/Humanize/Legato', () => {
  it('transposes selected notes by semitones', () => {
    const result = transformNotes(sampleNotes, ['n1', 'n2'], { transpose: 2 });
    expect(result[0].note).toBe('D4');
    expect(result[1].note).toBe('F#4');
    expect(result[2].note).toBe('G4'); // unchanged
  });

  it('clamps transposed notes to valid MIDI range', () => {
    const highNote: Note[] = [{ id: 'h', note: 'G9', start: 0, duration: 1, velocity: 0.8 }];
    const result = transformNotes(highNote, ['h'], { transpose: 12 });
    // Should not exceed G9 (127 = G9 in our naming)
    expect(result[0].note).toBe('G9');
  });

  it('humanizes timing with seeded RNG producing deterministic output', () => {
    const result1 = transformNotes(sampleNotes, ['n1', 'n2', 'n3', 'n4'], {
      humanize: { amount: 0.1, seed: 42 },
    });
    const result2 = transformNotes(sampleNotes, ['n1', 'n2', 'n3', 'n4'], {
      humanize: { amount: 0.1, seed: 42 },
    });
    // Same seed → same output
    expect(result1).toEqual(result2);
    // But notes have been shifted
    const anyShifted = result1.some((n, i) => n.start !== sampleNotes[i].start);
    expect(anyShifted).toBe(true);
  });

  it('humanize amount=0 does not change notes', () => {
    const result = transformNotes(sampleNotes, ['n1', 'n2'], {
      humanize: { amount: 0, seed: 42 },
    });
    expect(result[0].start).toBe(0);
    expect(result[1].start).toBe(1);
  });

  it('legato extends each note to the next selected note start', () => {
    const result = transformNotes(sampleNotes, ['n1', 'n2', 'n3', 'n4'], { legato: true });
    // n1 extends to start of n2
    expect(result[0].duration).toBe(1); // n2.start - n1.start = 1
    // n2 extends to start of n3
    expect(result[1].duration).toBe(1); // n3.start - n2.start = 1
    // n3 extends to start of n4
    expect(result[2].duration).toBe(1); // n4.start - n3.start = 1
    // last note unchanged
    expect(result[3].duration).toBe(1.5);
  });

  it('legato preserves unselected notes', () => {
    const result = transformNotes(sampleNotes, ['n1', 'n3'], { legato: true });
    expect(result[0].duration).toBe(2); // extends to n3.start
    expect(result[1].duration).toBe(1); // n2 unselected, unchanged
    expect(result[2].duration).toBe(0.5); // n3 last selected, unchanged
  });

  it('supports combined transpose + humanize + legato', () => {
    const result = transformNotes(sampleNotes, ['n1', 'n2', 'n3', 'n4'], {
      transpose: 3,
      humanize: { amount: 0.05, seed: 7 },
      legato: true,
    });
    // All notes should be transposed
    expect(result[0].note).toBe('D#4');
    expect(result[1].note).toBe('G4');
    // Timing humanized (deterministic check)
    const result2 = transformNotes(sampleNotes, ['n1', 'n2', 'n3', 'n4'], {
      transpose: 3,
      humanize: { amount: 0.05, seed: 7 },
      legato: true,
    });
    expect(result).toEqual(result2);
  });
});
