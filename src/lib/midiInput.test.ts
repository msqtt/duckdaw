import { describe, expect, it, vi, afterEach } from 'vitest';
import { MidiCapture, midiNoteToName, connectMidiInputs } from './midiInput';

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

describe('connectMidiInputs device selection (REC-PRO-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects only the specified device when deviceId is provided', async () => {
    const input1 = { id: 'dev-1', onmidimessage: null };
    const input2 = { id: 'dev-2', onmidimessage: null };
    const inputs = new Map([['dev-1', input1], ['dev-2', input2]]);
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn().mockResolvedValue({ inputs }),
    });

    const cb = vi.fn();
    const disconnect = await connectMidiInputs(cb, 'dev-1');

    expect(input1.onmidimessage).not.toBeNull();
    expect(input2.onmidimessage).toBeNull();
    disconnect();
    expect(input1.onmidimessage).toBeNull();
  });

  it('does not overwrite or disconnect a handler owned by a newer operation', async () => {
    const newerHandler = vi.fn();
    const input = { id: 'dev-1', onmidimessage: newerHandler as ((event: { data: Uint8Array }) => void) | null };
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn().mockResolvedValue({ inputs: new Map([['dev-1', input]]) }),
    });

    const staleDisconnect = await connectMidiInputs(vi.fn(), undefined, () => false);
    expect(input.onmidimessage).toBe(newerHandler);
    staleDisconnect();
    expect(input.onmidimessage).toBe(newerHandler);

    const ownedDisconnect = await connectMidiInputs(vi.fn());
    input.onmidimessage = newerHandler;
    ownedDisconnect();
    expect(input.onmidimessage).toBe(newerHandler);
  });

  it('throws when specified deviceId is not found', async () => {
    const inputs = new Map([['dev-1', { id: 'dev-1', onmidimessage: null }]]);
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn().mockResolvedValue({ inputs }),
    });

    await expect(connectMidiInputs(vi.fn(), 'missing-id')).rejects.toThrow(/not found/);
  });

  it('connects all devices when no deviceId is specified', async () => {
    const input1 = { id: 'dev-1', onmidimessage: null };
    const input2 = { id: 'dev-2', onmidimessage: null };
    const inputs = new Map([['dev-1', input1], ['dev-2', input2]]);
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn().mockResolvedValue({ inputs }),
    });

    await connectMidiInputs(vi.fn());
    expect(input1.onmidimessage).not.toBeNull();
    expect(input2.onmidimessage).not.toBeNull();
  });
});
