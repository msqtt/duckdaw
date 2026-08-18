import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listMidiInputs,
  listAudioInputs,
  checkMidiSupport,
  checkAudioInputSupport,
} from './inputDevices';

describe('REC-PRO-01: Input Device Enumeration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('checkMidiSupport', () => {
    it('returns true when requestMIDIAccess is available', () => {
      vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() });
      expect(checkMidiSupport()).toBe(true);
    });

    it('returns false when requestMIDIAccess is not available', () => {
      vi.stubGlobal('navigator', {});
      expect(checkMidiSupport()).toBe(false);
    });
  });

  describe('checkAudioInputSupport', () => {
    it('returns true when getUserMedia is available', () => {
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn() },
      });
      expect(checkAudioInputSupport()).toBe(true);
    });

    it('returns false when mediaDevices is undefined', () => {
      vi.stubGlobal('navigator', {});
      expect(checkAudioInputSupport()).toBe(false);
    });
  });

  describe('listMidiInputs', () => {
    it('returns empty array when API not supported', async () => {
      vi.stubGlobal('navigator', {});
      const result = await listMidiInputs();
      expect(result).toEqual([]);
    });

    it('enumerates MIDI inputs from Web MIDI API', async () => {
      const inputs = new Map([
        ['id-1', { id: 'id-1', name: 'Keyboard A' }],
        ['id-2', { id: 'id-2', name: 'Pad B' }],
      ]);
      vi.stubGlobal('navigator', {
        requestMIDIAccess: vi.fn().mockResolvedValue({ inputs }),
      });

      const result = await listMidiInputs();
      expect(result).toEqual([
        { id: 'id-1', name: 'Keyboard A', type: 'midi' },
        { id: 'id-2', name: 'Pad B', type: 'midi' },
      ]);
    });

    it('generates fallback name when device name is empty', async () => {
      const inputs = new Map([['id-x', { id: 'id-x', name: '' }]]);
      vi.stubGlobal('navigator', {
        requestMIDIAccess: vi.fn().mockResolvedValue({ inputs }),
      });

      const result = await listMidiInputs();
      expect(result[0].name).toContain('MIDI');
    });
  });

  describe('listAudioInputs', () => {
    it('returns empty array when API not supported', async () => {
      vi.stubGlobal('navigator', {});
      const result = await listAudioInputs();
      expect(result).toEqual([]);
    });

    it('enumerates audio input devices', async () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic' },
            { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speaker' },
            { kind: 'audioinput', deviceId: 'mic-2', label: 'USB Mic' },
          ]),
        },
      });

      const result = await listAudioInputs();
      expect(result).toEqual([
        { id: 'mic-1', name: 'Built-in Mic', type: 'audio' },
        { id: 'mic-2', name: 'USB Mic', type: 'audio' },
      ]);
    });

    it('generates fallback name when label is empty', async () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audioinput', deviceId: 'abcdefgh1234', label: '' },
          ]),
        },
      });

      const result = await listAudioInputs();
      expect(result[0].name).toContain('Mic');
    });
  });
});
