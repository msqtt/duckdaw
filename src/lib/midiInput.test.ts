import { describe, expect, it } from 'vitest';
import { MidiCapture, midiNoteToName } from './midiInput';

describe('MIDI capture', () => {
  it('converts MIDI note numbers to note names', () => {
    expect(midiNoteToName(60)).toBe('C4');
    expect(midiNoteToName(61)).toBe('C#4');
    expect(midiNoteToName(36)).toBe('C2');
  });

  it('pairs note on/off events into editable notes', () => {
    const capture = new MidiCapture();
    capture.start(8);
    capture.handleMessage(new Uint8Array([0x90, 60, 100]), 8.5);
    capture.handleMessage(new Uint8Array([0x80, 60, 0]), 10);

    expect(capture.stop()).toEqual([{
      id: expect.any(String),
      note: 'C4',
      start: 0.5,
      duration: 1.5,
      velocity: 100 / 127,
    }]);
  });

  it('treats note-on velocity zero as note-off and closes held notes on stop', () => {
    const capture = new MidiCapture();
    capture.start(0);
    capture.handleMessage(new Uint8Array([0x91, 64, 127]), 1);
    capture.handleMessage(new Uint8Array([0x91, 64, 0]), 2);
    capture.handleMessage(new Uint8Array([0x90, 67, 64]), 3);

    const notes = capture.stop(4);
    expect(notes.map(note => [note.note, note.start, note.duration])).toEqual([
      ['E4', 1, 1],
      ['G4', 3, 1],
    ]);
  });
});
