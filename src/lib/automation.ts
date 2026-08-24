export type AutomationCurve = 'step' | 'linear' | 'exponential';
export type LegacyAutomationTarget = 'volume' | 'pan' | 'reverb' | 'delay' | 'masterVolume';
export type TrackBooleanAutomationTarget = 'track.mute' | 'track.solo';
export type PluginAutomationTarget = `instrument:${string}:${string}` | `effect:${string}:${string}`;
export type AutomationTarget = LegacyAutomationTarget | TrackBooleanAutomationTarget | PluginAutomationTarget;
export type AutomationValueType = 'continuous' | 'discrete';

export interface AutomationRange {
  min: number;
  max: number;
}

export interface AutomationBinding {
  target: AutomationTarget;
  label: string;
  range: AutomationRange;
  valueType: AutomationValueType;
  values?: string[];
}

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
  label?: string;
  range?: AutomationRange;
  valueType?: AutomationValueType;
  values?: string[];
}

export const AUTOMATION_RANGES: Record<LegacyAutomationTarget | TrackBooleanAutomationTarget, AutomationRange> = {
  volume: { min: 0, max: 1 },
  pan: { min: -1, max: 1 },
  reverb: { min: 0, max: 1 },
  delay: { min: 0, max: 1 },
  masterVolume: { min: 0, max: 1 },
  'track.mute': { min: 0, max: 1 },
  'track.solo': { min: 0, max: 1 },
};

const TARGET_SEGMENT = /^[^:\s]{1,128}$/;
const LEGACY_TARGETS = new Set<AutomationTarget>(['volume', 'pan', 'reverb', 'delay', 'masterVolume']);
const TRACK_BOOLEAN_TARGETS = new Set<AutomationTarget>(['track.mute', 'track.solo']);

export type ParsedAutomationTarget =
  | { kind: 'legacy'; target: LegacyAutomationTarget }
  | { kind: 'track'; parameter: 'mute' | 'solo' }
  | { kind: 'plugin'; pluginKind: 'instrument' | 'effect'; instanceId: string; parameterId: string };

export function parseAutomationTarget(target: unknown): ParsedAutomationTarget | null {
  if (typeof target !== 'string') return null;
  if (LEGACY_TARGETS.has(target as AutomationTarget)) {
    return { kind: 'legacy', target: target as LegacyAutomationTarget };
  }
  if (target === 'track.mute' || target === 'track.solo') {
    return { kind: 'track', parameter: target === 'track.mute' ? 'mute' : 'solo' };
  }
  const match = /^(instrument|effect):([^:]+):([^:]+)$/.exec(target);
  if (!match || !TARGET_SEGMENT.test(match[2]) || !TARGET_SEGMENT.test(match[3])) return null;
  return {
    kind: 'plugin',
    pluginKind: match[1] as 'instrument' | 'effect',
    instanceId: match[2],
    parameterId: match[3],
  };
}

export function getAutomationRange(target: AutomationTarget, lane?: Pick<AutomationLane, 'range'>): AutomationRange | undefined {
  if (target in AUTOMATION_RANGES) return AUTOMATION_RANGES[target as keyof typeof AUTOMATION_RANGES];
  return lane?.range;
}

export function getAutomationLabel(lane: Pick<AutomationLane, 'target' | 'label'>): string {
  if (lane.label?.trim()) return lane.label;
  const labels: Record<string, string> = {
    volume: 'Volume', pan: 'Pan', reverb: 'Reverb', delay: 'Delay', masterVolume: 'Master Vol',
    'track.mute': 'Mute', 'track.solo': 'Solo',
  };
  return labels[lane.target] ?? lane.target;
}

export function isValueInRange(target: AutomationTarget, value: number, lane?: Pick<AutomationLane, 'range'>): boolean {
  const range = getAutomationRange(target, lane);
  return Boolean(range) && Number.isFinite(value) && value >= range!.min && value <= range!.max;
}

export function sortAutomationPoints(points: readonly AutomationPoint[]): AutomationPoint[] {
  return points.map(point => ({ ...point })).sort((a, b) => a.beat - b.beat);
}

export function validateAutomationLane(lane: AutomationLane): string[] {
  const errors: string[] = [];
  if (!lane || typeof lane.id !== 'string' || lane.id.length === 0) errors.push('Automation lane ID is required');
  const parsedTarget = parseAutomationTarget(lane?.target);
  if (!parsedTarget) errors.push('Invalid automation target');
  if (typeof lane?.enabled !== 'boolean') errors.push('Automation enabled must be boolean');
  if (lane?.label != null && (typeof lane.label !== 'string' || lane.label.trim().length === 0 || lane.label.length > 160)) {
    errors.push('Invalid automation label');
  }

  const range = getAutomationRange(lane?.target, lane);
  if (parsedTarget?.kind === 'plugin' && lane?.range == null) errors.push('Dynamic automation range is required');
  if (lane?.range != null && (!Number.isFinite(lane.range.min) || !Number.isFinite(lane.range.max) || lane.range.min >= lane.range.max)) {
    errors.push('Invalid automation range');
  }
  if (lane?.valueType != null && lane.valueType !== 'continuous' && lane.valueType !== 'discrete') {
    errors.push('Invalid automation value type');
  }
  if (lane?.values != null && (!Array.isArray(lane.values) || lane.values.length === 0
    || lane.values.some(value => typeof value !== 'string' || value.length === 0)
    || new Set(lane.values).size !== lane.values.length)) {
    errors.push('Invalid automation enum values');
  }
  if (lane?.values != null && lane.valueType !== 'discrete') errors.push('Automation enum values require discrete value type');
  if (!range && parsedTarget) errors.push('Automation range is required');
  if (!Array.isArray(lane?.points)) return [...errors, 'Automation points must be an array'];

  const discrete = lane.valueType === 'discrete' || TRACK_BOOLEAN_TARGETS.has(lane.target);
  const points = sortAutomationPoints(lane.points);
  const ids = new Set<string>();
  const beats = new Set<number>();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (typeof point.id !== 'string' || point.id.length === 0 || ids.has(point.id)) errors.push('Automation point IDs must be unique');
    if (!Number.isFinite(point.beat) || point.beat < 0 || beats.has(point.beat)) errors.push('Automation beats must be finite, non-negative, and unique');
    if (!isValueInRange(lane.target, point.value, lane)) errors.push('Automation value is outside the target range');
    if (point.curve !== 'step' && point.curve !== 'linear' && point.curve !== 'exponential') errors.push('Invalid automation curve');
    if (discrete && (!Number.isInteger(point.value) || point.curve !== 'step')) errors.push('Discrete automation values must be integers with step curves');
    if (point.curve === 'exponential' && next && (point.value <= 0 || next.value <= 0)) {
      errors.push('Exponential automation endpoints must be positive');
    }
    ids.add(point.id);
    beats.add(point.beat);
  }
  return errors;
}

export function normalizeAutomationLane(lane: AutomationLane): AutomationLane {
  const normalized: AutomationLane = {
    ...lane,
    ...(lane.range == null ? {} : { range: { ...lane.range } }),
    ...(lane.values == null ? {} : { values: [...lane.values] }),
    points: sortAutomationPoints(lane.points ?? []),
  };
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

/** Shared realtime/offline AudioParam schedule plan. Times are absolute render seconds. */
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

export interface ControlAutomationEvent {
  time: number;
  value: number;
}

/** Shared callback plan for generic plugin/boolean controls without exposed AudioParams. */
export function generateControlAutomationEvents(
  points: readonly AutomationPoint[],
  beatsToSeconds: (beat: number) => number,
  startBeat: number,
  endBeat: number,
  resolutionBeats = 1 / 16,
  discrete = false,
): ControlAutomationEvent[] {
  if (points.length === 0 || endBeat < startBeat || !Number.isFinite(resolutionBeats) || resolutionBeats <= 0) return [];
  const sorted = sortAutomationPoints(points);
  if (discrete) {
    const events: ControlAutomationEvent[] = [{ time: beatsToSeconds(startBeat), value: evaluateAutomationAtBeat(sorted, startBeat) }];
    for (const point of sorted) {
      if (point.beat <= startBeat || point.beat > endBeat) continue;
      events.push({ time: beatsToSeconds(point.beat), value: point.value });
    }
    return events.filter((event, index) => index === 0 || event.time !== events[index - 1].time || event.value !== events[index - 1].value);
  }

  const MAX_EVENTS = 16_384;
  const span = Math.max(0, endBeat - startBeat);
  const step = Math.max(resolutionBeats, span / Math.max(1, MAX_EVENTS - 1));
  const beats = new Set<number>([startBeat, endBeat]);
  for (let beat = startBeat; beat <= endBeat && beats.size < MAX_EVENTS; beat += step) {
    beats.add(Math.min(endBeat, Number(beat.toFixed(9))));
  }
  for (const point of sorted) {
    if (point.beat >= startBeat && point.beat <= endBeat && beats.size < MAX_EVENTS) beats.add(point.beat);
  }
  return [...beats]
    .sort((left, right) => left - right)
    .map(beat => ({ time: beatsToSeconds(beat), value: evaluateAutomationAtBeat(sorted, beat) }));
}
