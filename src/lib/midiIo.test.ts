import { describe, it, expect, beforeAll } from 'vitest';
import { parseMidi, writeMidi } from 'midi-file';
import { importMidi, exportMidi, type MidiExportOptions } from './midiIo';
import type { Note } from '../store/dawStore';

// --- Helpers to build fixture MidiData ---
function makeType0SingleNote() {
  return {
    header: { format: 0 as const, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[
      { deltaTime: 0, type: 'setTempo' as const, microsecondsPerBeat: 500000, meta: true as const },
      { deltaTime: 0, type: 'timeSignature' as const, numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8, meta: true as const },
      { deltaTime: 0, type: 'noteOn' as const, channel: 0, noteNumber: 60, velocity: 100 },
      { deltaTime: 480, type: 'noteOff' as const, channel: 0, noteNumber: 60, velocity: 0 },
      { deltaTime: 0, type: 'endOfTrack' as const, meta: true as const },
    ]],
  };
}

function makeType1TwoTracks() {
  return {
    header: { format: 1 as const, numTracks: 3, ticksPerBeat: 480 },
    tracks: [
      // Conductor track
      [
        { deltaTime: 0, type: 'setTempo' as const, microsecondsPerBeat: 500000, meta: true as const },
        { deltaTime: 0, type: 'timeSignature' as const, numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8, meta: true as const },
        { deltaTime: 0, type: 'endOfTrack' as const, meta: true as const },
      ],
      // Track 1
      [
        { deltaTime: 0, type: 'noteOn' as const, channel: 0, noteNumber: 60, velocity: 80 },
        { deltaTime: 240, type: 'noteOff' as const, channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: 'noteOn' as const, channel: 0, noteNumber: 64, velocity: 90 },
        { deltaTime: 240, type: 'noteOff' as const, channel: 0, noteNumber: 64, velocity: 0 },
        { deltaTime: 0, type: 'endOfTrack' as const, meta: true as const },
      ],
      // Track 2
      [
        { deltaTime: 0, type: 'noteOn' as const, channel: 1, noteNumber: 48, velocity: 100 },
        { deltaTime: 480, type: 'noteOff' as const, channel: 1, noteNumber: 48, velocity: 0 },
        { deltaTime: 0, type: 'noteOn' as const, channel: 1, noteNumber: 50, velocity: 110 },
        { deltaTime: 480, type: 'noteOff' as const, channel: 1, noteNumber: 50, velocity: 0 },
        { deltaTime: 0, type: 'endOfTrack' as const, meta: true as const },
      ],
    ],
  };
}

describe('MIDI-IO-01: SMF Import', () => {
  it('parses Type 0 single-note correctly', () => {
    const bytes = new Uint8Array(writeMidi(makeType0SingleNote()));
    const result = importMidi(bytes.buffer as ArrayBuffer);
    expect(result.format).toBe(0);
    expect(result.tempo).toBe(120);
    expect(result.ppq).toBe(480);
    expect(result.timeSignature).toEqual([4, 4]);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].notes).toHaveLength(1);
    expect(result.tracks[0].notes[0]).toMatchObject({
      note: 'C4',
      start: 0,
      duration: 1, // 480 ticks / 480 ppq = 1 beat
      velocity: expect.closeTo(100 / 127, 2),
    });
  });

  it('parses Type 1 multi-track', () => {
    const bytes = new Uint8Array(writeMidi(makeType1TwoTracks()));
    const result = importMidi(bytes.buffer as ArrayBuffer);
    expect(result.format).toBe(1);
    expect(result.tracks).toHaveLength(2); // conductor track excluded
    expect(result.tracks[0].notes).toHaveLength(2);
    expect(result.tracks[1].notes).toHaveLength(2);
  });

  it('rejects Type 2 SMF with clear error', () => {
    const data = {
      header: { format: 2 as const, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[{ deltaTime: 0, type: 'endOfTrack' as const, meta: true as const }]],
    };
    const bytes = new Uint8Array(writeMidi(data as any));
    expect(() => importMidi(bytes.buffer as ArrayBuffer)).toThrow(/type\s*2/i);
  });

  it('handles empty track gracefully', () => {
    const data = {
      header: { format: 1 as const, numTracks: 2, ticksPerBeat: 480 },
      tracks: [
        [
          { deltaTime: 0, type: 'setTempo' as const, microsecondsPerBeat: 500000, meta: true as const },
          { deltaTime: 0, type: 'endOfTrack' as const, meta: true as const },
        ],
        [{ deltaTime: 0, type: 'endOfTrack' as const, meta: true as const }],
      ],
    };
    const bytes = new Uint8Array(writeMidi(data));
    const result = importMidi(bytes.buffer as ArrayBuffer);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].notes).toHaveLength(0);
  });
});

describe('MIDI-IO-02: SMF Export + Roundtrip', () => {
  it('exports Type 0 with single track', () => {
    const notes: Note[] = [
      { id: '1', note: 'C4', start: 0, duration: 1, velocity: 0.8 },
      { id: '2', note: 'E4', start: 1, duration: 0.5, velocity: 0.6 },
    ];
    const bytes = exportMidi([{ notes, channel: 0 }], { format: 0, ppq: 480, tempo: 120 });
    const parsed = parseMidi(bytes);
    expect(parsed.header.format).toBe(0);
    expect(parsed.header.numTracks).toBe(1);
  });

  it('exports Type 1 preserving multi-track', () => {
    const tracks = [
      { notes: [{ id: '1', note: 'C4', start: 0, duration: 1, velocity: 0.8 }], channel: 0 },
      { notes: [{ id: '2', note: 'E2', start: 0, duration: 2, velocity: 1.0 }], channel: 1 },
    ];
    const bytes = exportMidi(tracks, { format: 1, ppq: 480, tempo: 120 });
    const parsed = parseMidi(bytes);
    expect(parsed.header.format).toBe(1);
    expect(parsed.header.numTracks).toBe(3); // conductor + 2 tracks
  });

  it('roundtrip import→export→import preserves notes within <=1 tick', () => {
    const sourceBytes = new Uint8Array(writeMidi(makeType1TwoTracks()));
    const imported = importMidi(sourceBytes.buffer as ArrayBuffer);

    const exportTracks = imported.tracks.map((t, i) => ({ notes: t.notes, channel: i }));
    const exported = exportMidi(exportTracks, {
      format: 1,
      ppq: imported.ppq,
      tempo: imported.tempo,
      timeSignature: imported.timeSignature,
    });

    const reimported = importMidi(exported.buffer as ArrayBuffer);

    // Check note data matches within 1 tick tolerance
    for (let t = 0; t < imported.tracks.length; t++) {
      expect(reimported.tracks[t].notes).toHaveLength(imported.tracks[t].notes.length);
      for (let n = 0; n < imported.tracks[t].notes.length; n++) {
        const orig = imported.tracks[t].notes[n];
        const re = reimported.tracks[t].notes[n];
        expect(re.note).toBe(orig.note);
        // 1 tick = 1/ppq beats
        const tolerance = 1 / imported.ppq;
        expect(Math.abs(re.start - orig.start)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(re.duration - orig.duration)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(re.velocity - orig.velocity)).toBeLessThanOrEqual(1 / 127);
      }
    }
  });

  it('byte-exact roundtrip for raw parseMidi→writeMidi', () => {
    const original = new Uint8Array(writeMidi(makeType0SingleNote()));
    const parsed = parseMidi(original);
    const rewritten = new Uint8Array(writeMidi(parsed));
    expect(rewritten).toEqual(original);
  });
});
