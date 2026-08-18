/**
 * REC-PRO-01: MIDI/Audio Input Device Enumeration & Capability Detection
 */

export interface InputDevice {
  id: string;
  name: string;
  type: 'midi' | 'audio';
}

/**
 * Check if the browser supports the Web MIDI API.
 */
export function checkMidiSupport(): boolean {
  return !!(navigator as any).requestMIDIAccess;
}

/**
 * Check if the browser supports audio input (getUserMedia).
 */
export function checkAudioInputSupport(): boolean {
  return !!(navigator as any).mediaDevices?.getUserMedia;
}

/**
 * Enumerate available MIDI input devices.
 * Returns empty array if Web MIDI is not supported or no devices are found.
 */
export async function listMidiInputs(): Promise<InputDevice[]> {
  if (!checkMidiSupport()) return [];

  try {
    const access = await (navigator as any).requestMIDIAccess();
    const inputs = [...access.inputs.values()];
    return inputs.map((input: any) => ({
      id: input.id,
      name: input.name || `MIDI ${input.id}`,
      type: 'midi' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Enumerate available audio input devices.
 * Returns empty array if the API is not supported or permission is denied.
 */
export async function listAudioInputs(): Promise<InputDevice[]> {
  if (!(navigator as any).mediaDevices?.enumerateDevices) return [];

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({
        id: d.deviceId,
        name: d.label || `Mic ${d.deviceId.slice(0, 8)}`,
        type: 'audio' as const,
      }));
  } catch {
    return [];
  }
}
