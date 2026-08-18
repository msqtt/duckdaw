import { describe, expect, it } from 'vitest';
import {
  addAutomationPoint,
  evaluateAutomationAtBeat,
  normalizeAutomationLane,
  updateAutomationPoints,
  type AutomationLane,
  type AutomationPoint,
} from './automation';

const lane = (points: AutomationPoint[], target: AutomationLane['target'] = 'volume'): AutomationLane => ({
  id: 'lane-1',
  target,
  enabled: true,
  points,
});

const point = (
  id: string,
  beat: number,
  value: number,
  curve: AutomationPoint['curve'] = 'linear',
): AutomationPoint => ({ id, beat, value, curve });

describe('automation', () => {
  it('uses the supplied default for an empty or disabled lane', () => {
    expect(evaluateAutomationAtBeat(lane([]), 4, 0.75)).toBe(0.75);
    expect(evaluateAutomationAtBeat({ ...lane([point('a', 0, 0.2)]), enabled: false }, 4, 0.75)).toBe(0.75);
  });

  it('evaluates step, linear and exponential segments', () => {
    expect(evaluateAutomationAtBeat(lane([
      point('a', 0, 0.2, 'step'),
      point('b', 4, 0.8),
    ]), 2, 0)).toBeCloseTo(0.2, 10);

    expect(evaluateAutomationAtBeat(lane([
      point('a', 0, 0.2, 'linear'),
      point('b', 4, 0.8),
    ]), 2, 0)).toBeCloseTo(0.5, 10);

    expect(evaluateAutomationAtBeat(lane([
      point('a', 0, 0.25, 'exponential'),
      point('b', 4, 1),
    ]), 2, 0)).toBeCloseTo(0.5, 10);
  });

  it('sorts points stably and does not mutate caller-owned arrays', () => {
    const points = [point('b', 4, 0.8), point('a', 0, 0.2)];
    const normalized = normalizeAutomationLane(lane(points));
    expect(normalized.points.map(item => item.id)).toEqual(['a', 'b']);
    expect(points.map(item => item.id)).toEqual(['b', 'a']);
  });

  it('adds and updates points immutably', () => {
    const original = lane([point('a', 0, 0.2)]);
    const added = addAutomationPoint(original, point('b', 4, 0.8));
    const updated = updateAutomationPoints(added, [{ id: 'b', beat: 2, value: 0.6, curve: 'step' }]);
    expect(original.points).toHaveLength(1);
    expect(updated.points).toEqual([
      point('a', 0, 0.2),
      point('b', 2, 0.6, 'step'),
    ]);
  });

  it.each([
    { name: 'duplicate id', value: lane([point('a', 0, 0.2), point('a', 1, 0.3)]) },
    { name: 'duplicate beat', value: lane([point('a', 0, 0.2), point('b', 0, 0.3)]) },
    { name: 'negative beat', value: lane([point('a', -1, 0.2)]) },
    { name: 'volume above range', value: lane([point('a', 0, 1.1)]) },
    { name: 'pan below range', value: lane([point('a', 0, -1.1)], 'pan') },
    { name: 'exponential zero endpoint', value: lane([point('a', 0, 0, 'exponential'), point('b', 1, 1)]) },
  ])('rejects $name', ({ value }) => {
    expect(() => normalizeAutomationLane(value)).toThrow();
  });

  it('rejects an update for an unknown point without changing the lane', () => {
    const original = lane([point('a', 0, 0.2)]);
    expect(() => updateAutomationPoints(original, [point('missing', 1, 0.3)])).toThrow();
    expect(original.points).toEqual([point('a', 0, 0.2)]);
  });
});
