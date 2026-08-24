import { describe, expect, it } from 'vitest';
import {
  generateControlAutomationEvents,
  normalizeAutomationLane,
  parseAutomationTarget,
  type AutomationLane,
} from './automation';

const dynamicLane = (overrides: Partial<AutomationLane> = {}): AutomationLane => ({
  id: 'lane-1',
  target: 'instrument:instrument-1:attack',
  label: 'Attack',
  range: { min: 0.001, max: 2 },
  valueType: 'continuous',
  enabled: true,
  points: [
    { id: 'p0', beat: 0, value: 0.1, curve: 'linear' },
    { id: 'p1', beat: 1, value: 1, curve: 'step' },
  ],
  ...overrides,
});

describe('AUTO-T02 dynamic automation domain', () => {
  it('parses instance-scoped plugin targets while retaining legacy targets', () => {
    expect(parseAutomationTarget('volume')).toEqual({ kind: 'legacy', target: 'volume' });
    expect(parseAutomationTarget('instrument:instrument-1:attack')).toEqual({
      kind: 'plugin', pluginKind: 'instrument', instanceId: 'instrument-1', parameterId: 'attack',
    });
    expect(parseAutomationTarget('effect:fx-2:drive')).toEqual({
      kind: 'plugin', pluginKind: 'effect', instanceId: 'fx-2', parameterId: 'drive',
    });
    expect(parseAutomationTarget('effect::drive')).toBeNull();
    expect(parseAutomationTarget('effect:fx:bad:param')).toBeNull();
  });

  it('validates dynamic ranges and discrete enum snapshots without weakening old lanes', () => {
    expect(normalizeAutomationLane(dynamicLane()).target).toBe('instrument:instrument-1:attack');
    expect(() => normalizeAutomationLane(dynamicLane({ range: undefined }))).toThrow(/range/i);
    expect(() => normalizeAutomationLane(dynamicLane({
      target: 'effect:fx-1:mode', range: { min: 0, max: 2 }, valueType: 'discrete',
      values: ['low', 'mid', 'high'],
      points: [{ id: 'p0', beat: 0, value: 1, curve: 'linear' }],
    }))).toThrow(/step/i);
    expect(normalizeAutomationLane({
      id: 'legacy', target: 'pan', enabled: true,
      points: [{ id: 'p', beat: 0, value: -1, curve: 'step' }],
    }).points[0].value).toBe(-1);
  });

  it('builds a deterministic bounded control-event plan shared by realtime and offline', () => {
    const events = generateControlAutomationEvents(dynamicLane().points, beat => beat * 0.5, 0, 1, 0.25);
    expect(events.map(event => event.time)).toEqual([0, 0.125, 0.25, 0.375, 0.5]);
    expect(events[0].value).toBeCloseTo(0.1);
    expect(events.at(-1)?.value).toBeCloseTo(1);

    const discrete = generateControlAutomationEvents([
      { id: 'a', beat: 0, value: 0, curve: 'step' },
      { id: 'b', beat: 2, value: 1, curve: 'step' },
    ], beat => beat, 0, 4, 0.25, true);
    expect(discrete).toEqual([{ time: 0, value: 0 }, { time: 2, value: 1 }]);
  });
});
