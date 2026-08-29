import type { Note } from '../store/dawStore';

interface ActiveMidiNote {
  noteNumber: number;
  startBeat: number;
  velocity: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteToName(noteNumber: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(noteNumber)));
  return `${NOTE_NAMES[clamped % 12]}${Math.floor(clamped / 12) - 1}`;
}

export class MidiCapture {
  private recordingStartBeat = 0;
  private active = new Map<string, ActiveMidiNote>();
  private completed: Note[] = [];

  start(startBeat: number) {
    this.recordingStartBeat = startBeat;
    this.active.clear();
    this.completed = [];
  }

  handleMessage(data: Uint8Array, currentBeat: number) {
    const [status = 0, noteNumber = 0, velocity = 0] = data;
    const command = status & 0xf0;
    const channel = status & 0x0f;
    const key = `${channel}:${noteNumber}`;

    if (command === 0x90 && velocity > 0) {
      this.active.set(key, { noteNumber, startBeat: currentBeat, velocity: velocity / 127 });
      return;
    }
    if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.finishNote(key, currentBeat);
    }
  }

  stop(currentBeat?: number): Note[] {
    const endBeat = currentBeat ?? this.recordingStartBeat;
    for (const key of [...this.active.keys()]) this.finishNote(key, endBeat);
    return [...this.completed].sort((left, right) => left.start - right.start);
  }

  private finishNote(key: string, endBeat: number) {
    const active = this.active.get(key);
    if (!active) return;
    this.active.delete(key);
    this.completed.push({
      id: crypto.randomUUID(),
      note: midiNoteToName(active.noteNumber),
      start: Math.max(0, active.startBeat - this.recordingStartBeat),
      duration: Math.max(1 / 64, endBeat - active.startBeat),
      velocity: active.velocity,
    });
  }
}

export async function connectMidiInputs(
  onMessage: (data: Uint8Array) => void,
  deviceId?: string,
  isCurrent: () => boolean = () => true,
): Promise<() => void> {
  const requestMIDIAccess = (navigator as Navigator & {
    requestMIDIAccess?: () => Promise<{ inputs: Map<unknown, { id: string; onmidimessage: ((event: { data: Uint8Array }) => void) | null }> }>;
  }).requestMIDIAccess;
  if (!requestMIDIAccess) throw new Error('Web MIDI is not supported by this browser');

  const access = await requestMIDIAccess.call(navigator);
  const allInputs = [...access.inputs.values()];

  let inputs: typeof allInputs;
  if (deviceId != null) {
    inputs = allInputs.filter(input => input.id === deviceId);
    if (inputs.length === 0) throw new Error(`MIDI input device "${deviceId}" not found`);
  } else {
    inputs = allInputs;
    if (inputs.length === 0) throw new Error('No MIDI input device is available');
  }

  if (!isCurrent()) return () => {};

  const handlers = new Map<typeof inputs[number], (event: { data: Uint8Array }) => void>();
  for (const input of inputs) {
    const handler = (event: { data: Uint8Array }) => onMessage(event.data);
    handlers.set(input, handler);
    input.onmidimessage = handler;
  }
  return () => {
    for (const input of inputs) {
      if (input.onmidimessage === handlers.get(input)) input.onmidimessage = null;
    }
  };
}
