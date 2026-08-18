export interface AudioBufferLike {
  length: number;
  numberOfChannels: number;
}

interface CacheEntry<T> {
  promise: Promise<T>;
  value?: T;
  bytes: number;
  refs: number;
  lastUsed: number;
}

export interface AudioBufferCacheOptions<T> {
  maxBytes: number;
  loader: (resourceKey: string) => Promise<T>;
  estimateBytes?: (buffer: T) => number;
}

export class AudioBufferCache<T extends AudioBufferLike> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private clock = 0;
  private bytes = 0;

  constructor(private readonly options: AudioBufferCacheOptions<T>) {
    if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) {
      throw new Error('AudioBufferCache maxBytes must be positive');
    }
  }

  get totalBytes(): number {
    return this.bytes;
  }

  has(resourceKey: string): boolean {
    return this.entries.has(resourceKey);
  }

  async acquire(resourceKey: string): Promise<T> {
    const existing = this.entries.get(resourceKey);
    if (existing) {
      existing.refs += 1;
      existing.lastUsed = ++this.clock;
      return existing.promise;
    }

    const entry: CacheEntry<T> = {
      promise: Promise.resolve(undefined as unknown as T),
      bytes: 0,
      refs: 1,
      lastUsed: ++this.clock,
    };
    const load = this.options.loader(resourceKey)
      .then(value => {
        if (this.entries.get(resourceKey) !== entry) return value;
        entry.value = value;
        entry.bytes = this.options.estimateBytes?.(value)
          ?? value.length * value.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
        this.bytes += entry.bytes;
        this.evictReleased();
        return value;
      })
      .catch(error => {
        if (this.entries.get(resourceKey) === entry) this.entries.delete(resourceKey);
        throw error;
      });
    entry.promise = load;
    this.entries.set(resourceKey, entry);
    return load;
  }

  release(resourceKey: string): void {
    const entry = this.entries.get(resourceKey);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    entry.lastUsed = ++this.clock;
  }

  evictReleased(): void {
    if (this.bytes <= this.options.maxBytes) return;
    const candidates = [...this.entries.entries()]
      .filter(([, entry]) => entry.refs === 0 && entry.value !== undefined)
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
    for (const [key, entry] of candidates) {
      if (this.bytes <= this.options.maxBytes) break;
      this.entries.delete(key);
      this.bytes -= entry.bytes;
    }
  }

  clearReleased(): void {
    for (const [key, entry] of this.entries) {
      if (entry.refs !== 0 || entry.value === undefined) continue;
      this.entries.delete(key);
      this.bytes -= entry.bytes;
    }
  }
}
