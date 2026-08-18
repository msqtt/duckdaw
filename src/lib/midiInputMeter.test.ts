import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MidiInputMeter } from './midiInputMeter';

describe('REC-PRO-03: MIDI Input Meter', () => {
  let meter: MidiInputMeter;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    meter = new MidiInputMeter();
    nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('initial state is inactive with zero level', () => {
    const state = meter.read();
    expect(state.level).toBe(0);
    expect(state.peak).toBe(0);
    expect(state.active).toBe(false);
  });

  it('feed updates level and peak', () => {
    meter.feed(100);
    const state = meter.read();
    expect(state.level).toBe(100);
    expect(state.peak).toBe(100);
    expect(state.active).toBe(true);
  });

  it('peak holds across feeds', () => {
    meter.feed(120);
    meter.feed(80);
    const state = meter.read();
    expect(state.peak).toBe(120);
    expect(state.level).toBe(80);
  });

  it('level decays over time', () => {
    meter.feed(100);
    nowSpy.mockReturnValue(1150); // 150ms later, decay factor = 1 - 150/300 = 0.5
    const state = meter.read();
    expect(state.level).toBe(50); // 100 * 0.5
    expect(state.active).toBe(true);
  });

  it('becomes inactive after 500ms', () => {
    meter.feed(100);
    nowSpy.mockReturnValue(1600); // 600ms later
    const state = meter.read();
    expect(state.active).toBe(false);
  });

  it('clear resets level and peak', () => {
    meter.feed(127);
    meter.clear();
    const state = meter.read();
    expect(state.level).toBe(0);
    expect(state.peak).toBe(0);
  });

  it('detects clipping at velocity >= 127', () => {
    meter.feed(127);
    const state = meter.read();
    expect(state.isClipping).toBe(true);
  });

  it('no clipping below threshold', () => {
    meter.feed(100);
    const state = meter.read();
    expect(state.isClipping).toBe(false);
  });
});
