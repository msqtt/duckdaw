/**
 * REC-PRO-03: MIDI Input Level Meter (velocity-based)
 */

export interface MidiInputMeterState {
  level: number;      // 0-127, decayed
  peak: number;       // 0-127, held
  active: boolean;    // true if recent activity
  isClipping: boolean; // true if velocity >= 127
}

const DECAY_MS = 300;
const ACTIVE_TIMEOUT_MS = 500;
const CLIP_THRESHOLD = 127;

export class MidiInputMeter {
  private lastVelocity = 0;
  private peakVelocity = 0;
  private lastTime = 0;

  /**
   * Feed a MIDI note-on velocity (0-127).
   */
  feed(velocity: number): void {
    this.lastVelocity = velocity;
    if (velocity > this.peakVelocity) {
      this.peakVelocity = velocity;
    }
    this.lastTime = performance.now();
  }

  /**
   * Read the current meter state with decay applied.
   */
  read(): MidiInputMeterState {
    const now = performance.now();
    const age = now - this.lastTime;
    const decay = this.lastTime === 0 ? 0 : Math.max(0, 1 - age / DECAY_MS);
    const level = this.lastVelocity * decay;
    const active = this.lastTime > 0 && age < ACTIVE_TIMEOUT_MS;
    const isClipping = this.peakVelocity >= CLIP_THRESHOLD;

    return { level, peak: this.peakVelocity, active, isClipping };
  }

  /**
   * Reset all state.
   */
  clear(): void {
    this.lastVelocity = 0;
    this.peakVelocity = 0;
    this.lastTime = 0;
  }
}
