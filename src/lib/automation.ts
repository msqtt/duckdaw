export type AutomationCurve = 'step' | 'linear' | 'exponential';
export type AutomationTarget = 'volume' | 'pan' | 'reverb' | 'delay' | 'masterVolume';

export interface AutomationPoint {
  id: string;
  beat: number;
  value: number;
  curve: AutomationCurve;
}

export interface AutomationLane {
  id: string;
  target: AutomationTarget;
  enabled: boolean;
  points: AutomationPoint[];
}

export const AUTOMATION_RANGES: Record<AutomationTarget, { min: number; max: number }> = {
  volume: { min: 0, max: 1 },
  pan: { min: -1, max: 1 },
  reverb: { min: 0, max: 1 },
  delay: { min: 0, max: 1 },
  masterVolume: { min: 0, max: 1 },
};

export function isValueInRange(target: AutomationTarget, value: number): boolean {
  const range = AUTOMATION_RANGES[target];
  return Boolean(range) && Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function sortAutomationPoints(points: readonly AutomationPoint[]): AutomationPoint[] {
  return points.map(point => ({ ...point })).sort((a, b) => a.beat - b.beat);
}

export function validateAutomationLane(lane: AutomationLane): string[] {
  const errors: string[] = [];
  if (!lane || typeof lane.id !== 'string' || lane.id.length === 0) errors.push('Automation lane ID is required');
  if (!AUTOMATION_RANGES[lane?.target]) errors.push('Invalid automation target');
  if (typeof lane?.enabled !== 'boolean') errors.push('Automation enabled must be boolean');
  if (!Array.isArray(lane?.points)) return [...errors, 'Automation points must be an array'];

  const points = sortAutomationPoints(lane.points);
  const ids = new Set<string>();
  const beats = new Set<number>();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (typeof point.id !== 'string' || point.id.length === 0 || ids.has(point.id)) errors.push('Automation point IDs must be unique');
    if (!Number.isFinite(point.beat) || point.beat < 0 || beats.has(point.beat)) errors.push('Automation beats must be finite, non-negative, and unique');
    if (!isValueInRange(lane.target, point.value)) errors.push('Automation value is outside the target range');
    if (point.curve !== 'step' && point.curve !== 'linear' && point.curve !== 'exponential') errors.push('Invalid automation curve');
    if (point.curve === 'exponential' && next && (point.value <= 0 || next.value <= 0)) {
      errors.push('Exponential automation endpoints must be positive');
    }
    ids.add(point.id);
    beats.add(point.beat);
  }
  return errors;
}

export function normalizeAutomationLane(lane: AutomationLane): AutomationLane {
  const normalized: AutomationLane = { ...lane, points: sortAutomationPoints(lane.points ?? []) };
  const errors = validateAutomationLane(normalized);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return normalized;
}

export function evaluateAutomationAtBeat(
  laneOrPoints: AutomationLane | readonly AutomationPoint[],
  beat: number,
  defaultValue = 0,
): number {
  const enabled = Array.isArray(laneOrPoints) ? true : (laneOrPoints as AutomationLane).enabled;
  const rawPoints = Array.isArray(laneOrPoints) ? laneOrPoints : (laneOrPoints as AutomationLane).points;
  if (!enabled || rawPoints.length === 0) return defaultValue;
  const points = sortAutomationPoints(rawPoints);
  if (beat <= points[0].beat) return points[0].value;
  if (beat >= points[points.length - 1].beat) return points[points.length - 1].value;

  const rightIndex = points.findIndex(point => point.beat > beat);
  const left = points[rightIndex - 1];
  const right = points[rightIndex];
  const fraction = (beat - left.beat) / (right.beat - left.beat);
  if (left.curve === 'step') return left.value;
  if (left.curve === 'exponential') {
    if (left.value <= 0 || right.value <= 0) throw new Error('Exponential automation endpoints must be positive');
    return left.value * Math.pow(right.value / left.value, fraction);
  }
  return left.value + (right.value - left.value) * fraction;
}

export function addAutomationPoint(lane: AutomationLane, point: AutomationPoint): AutomationLane {
  return normalizeAutomationLane({ ...lane, points: [...lane.points, { ...point }] });
}

export function updateAutomationPoints(
  lane: AutomationLane,
  updates: ReadonlyArray<AutomationPoint>,
): AutomationLane {
  const updateById = new Map(updates.map(point => [point.id, point]));
  for (const id of updateById.keys()) {
    if (!lane.points.some(point => point.id === id)) throw new Error(`Unknown automation point: ${id}`);
  }
  return normalizeAutomationLane({
    ...lane,
    points: lane.points.map(point => updateById.has(point.id) ? { ...updateById.get(point.id)! } : { ...point }),
  });
}

export interface AutomationScheduleEntry {
  time: number;
  value: number;
  rampType: 'set' | 'linear' | 'exponential';
}

/** Shared realtime/offline schedule plan. Times are absolute render seconds. */
export function generateAutomationSchedule(
  points: readonly AutomationPoint[],
  beatsToSeconds: (beat: number) => number,
  startBeat: number,
  endBeat: number,
): AutomationScheduleEntry[] {
  if (points.length === 0 || endBeat < startBeat) return [];
  const sorted = sortAutomationPoints(points);
  const schedule: AutomationScheduleEntry[] = [{
    time: beatsToSeconds(startBeat),
    value: evaluateAutomationAtBeat(sorted, startBeat),
    rampType: 'set',
  }];

  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    if (point.beat <= startBeat || point.beat > endBeat) continue;
    const previous = sorted[index - 1];
    schedule.push({
      time: beatsToSeconds(point.beat),
      value: point.value,
      rampType: previous?.curve === 'linear' || previous?.curve === 'exponential'
        ? previous.curve
        : 'set',
    });
  }
  return schedule;
}
