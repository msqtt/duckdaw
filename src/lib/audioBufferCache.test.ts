import { describe, expect, it, vi } from 'vitest';
import { AudioBufferCache } from './audioBufferCache';

interface FakeBuffer { id: string; length: number; numberOfChannels: number; }

const buffer = (id: string, length = 100): FakeBuffer => ({ id, length, numberOfChannels: 2 });

describe('AudioBufferCache', () => {
  it('deduplicates concurrent and repeated loads for the same resource', async () => {
    const loader = vi.fn(async (key: string) => buffer(key));
    const cache = new AudioBufferCache<FakeBuffer>({ maxBytes: 10_000, loader });

    const [first, second] = await Promise.all([cache.acquire('sample-a'), cache.acquire('sample-a')]);
    cache.release('sample-a');
    cache.release('sample-a');
    const third = await cache.acquire('sample-a');

    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('never evicts retained buffers and evicts least-recently-used released entries', async () => {
    const loader = vi.fn(async (key: string) => buffer(key, 100));
    const cache = new AudioBufferCache<FakeBuffer>({ maxBytes: 1_000, loader });

    await cache.acquire('retained');
    await cache.acquire('old');
    cache.release('old');
    await cache.acquire('new');
    cache.release('new');
    cache.evictReleased();

    expect(cache.has('retained')).toBe(true);
    expect(cache.totalBytes).toBeLessThanOrEqual(1_000);
    expect(cache.has('old')).toBe(false);
  });

  it('removes a failed load so a later acquire can retry', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce(buffer('retry'));
    const cache = new AudioBufferCache<FakeBuffer>({ maxBytes: 10_000, loader });

    await expect(cache.acquire('retry')).rejects.toThrow('decode failed');
    await expect(cache.acquire('retry')).resolves.toMatchObject({ id: 'retry' });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
