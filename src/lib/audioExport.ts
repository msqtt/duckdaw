import type { ExportLimiterOptions } from './exportPlan';

export interface AudioChannelData {
  channels: Float32Array[];
  sampleRate: number;
}

export interface AudioMetrics {
  peak: number;
  rms: number;
}

function validateAudio(data: AudioChannelData): void {
  if (!Number.isFinite(data.sampleRate) || data.sampleRate <= 0) throw new Error('Audio sample rate must be positive');
  if (data.channels.length === 0) throw new Error('Audio must contain at least one channel');
  const length = data.channels[0].length;
  for (const channel of data.channels) {
    if (channel.length !== length) throw new Error('Audio channel lengths must match');
    for (const sample of channel) {
      if (!Number.isFinite(sample)) throw new Error('Audio samples must be finite');
    }
  }
}

function cloneAudio(data: AudioChannelData): AudioChannelData {
  validateAudio(data);
  return { sampleRate: data.sampleRate, channels: data.channels.map(channel => new Float32Array(channel)) };
}

export function getAudioMetrics(data: AudioChannelData): AudioMetrics {
  validateAudio(data);
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  for (const channel of data.channels) {
    for (const sample of channel) {
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }
  return { peak, rms: sampleCount === 0 ? 0 : Math.sqrt(sumSquares / sampleCount) };
}

export function processMasterAudio(
  source: AudioChannelData,
  options: { normalize: boolean; limiter: ExportLimiterOptions },
): AudioChannelData {
  const result = cloneAudio(source);
  const { peak } = getAudioMetrics(result);
  const ceiling = 10 ** (options.limiter.ceilingDb / 20);
  if (!Number.isFinite(ceiling) || options.limiter.ceilingDb < -24 || options.limiter.ceilingDb > 0) {
    throw new Error('Limiter ceiling must be within -24..0 dBFS');
  }
  const gain = options.normalize && peak > 0 ? ceiling / peak : 1;
  for (const channel of result.channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const scaled = channel[index] * gain;
      channel[index] = options.limiter.enabled
        ? Math.max(-ceiling, Math.min(ceiling, scaled))
        : scaled;
    }
  }
  return result;
}

export function sumAudioChannels(stems: readonly AudioChannelData[]): AudioChannelData {
  if (stems.length === 0) throw new Error('At least one stem is required');
  stems.forEach(validateAudio);
  const first = stems[0];
  const channelCount = first.channels.length;
  const length = first.channels[0].length;
  if (stems.some(stem => stem.sampleRate !== first.sampleRate)) throw new Error('Stem sample rates must match');
  if (stems.some(stem => stem.channels.length !== channelCount)) throw new Error('Stem channel counts must match');
  if (stems.some(stem => stem.channels.some(channel => channel.length !== length))) throw new Error('Stem channel lengths must match');

  const channels = Array.from({ length: channelCount }, () => new Float32Array(length));
  for (const stem of stems) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      for (let index = 0; index < length; index += 1) channels[channel][index] += stem.channels[channel][index];
    }
  }
  return { channels, sampleRate: first.sampleRate };
}

export function audioBufferToChannelData(buffer: AudioBuffer): AudioChannelData {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => new Float32Array(buffer.getChannelData(index))),
  };
}

export function audioDataToWav(data: AudioChannelData): Blob {
  validateAudio(data);
  const channelCount = data.channels.length;
  const frameCount = data.channels[0].length;
  const bytesPerSample = 2;
  const dataLength = frameCount * channelCount * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, data.sampleRate, true);
  view.setUint32(28, data.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data.channels[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function sanitizeStemFileName(name: string, trackId: string): string {
  const safe = (value: string) => value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'track';
  return `${safe(name)}_${safe(trackId)}.wav`;
}

export interface BlobDownloadEnvironment {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => { href: string; download: string; click: () => void };
}

export function triggerBlobDownload(
  blob: Blob,
  fileName: string,
  environment?: BlobDownloadEnvironment,
): void {
  const env = environment ?? {
    createObjectURL: (value: Blob) => URL.createObjectURL(value),
    revokeObjectURL: (url: string) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
  };
  const url = env.createObjectURL(blob);
  try {
    const anchor = env.createAnchor();
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    env.revokeObjectURL(url);
  }
}
