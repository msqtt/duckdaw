import { AudioBufferCache } from './audioBufferCache';

export const decodedAudioCache = new AudioBufferCache<AudioBuffer>({
  maxBytes: 256 * 1024 * 1024,
  loader: async resourceUrl => {
    const context = new AudioContext();
    try {
      const response = await fetch(resourceUrl);
      if (response.ok === false) throw new Error(`Audio fetch failed: ${response.status}`);
      return await context.decodeAudioData(await response.arrayBuffer());
    } finally {
      await context.close();
    }
  },
});
