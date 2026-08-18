import { describe, expect, it, vi } from 'vitest';
import { measurePerf, measurePerfAsync } from './performance';

describe('performance measurement helpers', () => {
  it('records a synchronous measure and preserves the return value', () => {
    const mark = vi.spyOn(performance, 'mark');
    const measure = vi.spyOn(performance, 'measure');

    expect(measurePerf('clip-sync', () => 42)).toBe(42);
    expect(mark).toHaveBeenCalledWith('duckdaw:clip-sync:start');
    expect(measure).toHaveBeenCalledWith(
      'duckdaw:clip-sync',
      'duckdaw:clip-sync:start',
      'duckdaw:clip-sync:end',
    );
  });

  it('records an asynchronous measure even when the operation rejects', async () => {
    const measure = vi.spyOn(performance, 'measure');
    await expect(measurePerfAsync('recovery-save', async () => { throw new Error('failed'); }))
      .rejects.toThrow('failed');
    expect(measure).toHaveBeenCalledWith(
      'duckdaw:recovery-save',
      'duckdaw:recovery-save:start',
      'duckdaw:recovery-save:end',
    );
  });
});
