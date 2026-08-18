import { describe, expect, it } from 'vitest';
import {
  audioDataToWav,
  getAudioMetrics,
  processMasterAudio,
  sanitizeStemFileName,
  sumAudioChannels,
  triggerBlobDownload,
  type AudioChannelData,
} from './audioExport';

function audio(channels: number[][], sampleRate = 48000): AudioChannelData {
  return { channels: channels.map(values => Float32Array.from(values)), sampleRate };
}

describe('master export processing', () => {
  it('normalizes all channels with one gain and limits peak to the configured ceiling', () => {
    const source = audio([[0.25, -0.5], [0.125, -0.25]]);
    const result = processMasterAudio(source, { normalize: true, limiter: { enabled: true, ceilingDb: -6 } });
    const ceiling = 10 ** (-6 / 20);
    expect(getAudioMetrics(result).peak).toBeCloseTo(ceiling, 6);
    expect(result.channels[0][0] / result.channels[1][0]).toBeCloseTo(2, 6);
    expect(source.channels[0][1]).toBe(-0.5);
  });

  it('is a sample-identical clone when processing is disabled and preserves silence', () => {
    const source = audio([[0, -0.25, 0.25]]);
    const bypassed = processMasterAudio(source, { normalize: false, limiter: { enabled: false, ceilingDb: -1 } });
    expect([...bypassed.channels[0]]).toEqual([...source.channels[0]]);
    expect(bypassed.channels[0]).not.toBe(source.channels[0]);
    expect([...processMasterAudio(audio([[0, 0]]), { normalize: true, limiter: { enabled: true, ceilingDb: -1 } }).channels[0]]).toEqual([0, 0]);
  });

  it('rejects non-finite PCM and invalid channel shapes before encoding', () => {
    expect(() => processMasterAudio(audio([[Number.NaN]]), { normalize: false, limiter: { enabled: false, ceilingDb: -1 } })).toThrow(/finite/i);
    expect(() => sumAudioChannels([audio([[1, 2]]), audio([[1]])])).toThrow(/length/i);
  });

  it('sums linear stems sample-wise and reports peak/RMS metrics', () => {
    const summed = sumAudioChannels([audio([[0.25, -0.25], [0.1, 0.2]]), audio([[0.5, 0.25], [-0.1, 0.3]])]);
    expect([...summed.channels[0]]).toEqual([0.75, 0]);
    expect([...summed.channels[1]]).toEqual([0, 0.5]);
    expect(getAudioMetrics(summed)).toEqual({ peak: 0.75, rms: Math.sqrt((0.75 ** 2 + 0.5 ** 2) / 4) });
  });

  it('encodes interleaved PCM16 WAV and creates deterministic safe stem names', async () => {
    const wav = audioDataToWav(audio([[1, -1], [0.5, -0.5]], 44100));
    const view = new DataView(await wav.arrayBuffer());
    expect(new TextDecoder().decode(new Uint8Array(await wav.arrayBuffer(), 0, 12))).toBe('RIFF,\u0000\u0000\u0000WAVE');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(16383);
    expect(sanitizeStemFileName('01 Drums / Room', 'track:one')).toBe('01-drums-room_track-one.wav');
  });

  it('triggers one download and always releases its Blob URL', () => {
    const calls: string[] = [];
    const anchor = { href: '', download: '', click: () => calls.push('click') };
    triggerBlobDownload(new Blob(['wav']), 'mix.wav', {
      createObjectURL: () => { calls.push('create'); return 'blob:export'; },
      revokeObjectURL: url => calls.push(`revoke:${url}`),
      createAnchor: () => anchor,
    });
    expect(anchor).toMatchObject({ href: 'blob:export', download: 'mix.wav' });
    expect(calls).toEqual(['create', 'click', 'revoke:blob:export']);
  });
});
