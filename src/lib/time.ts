export type TimeSignature = [number, number];

export function beatsPerBar([numerator, denominator]: TimeSignature): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    throw new Error('Invalid time signature');
  }
  return numerator * (4 / denominator);
}

export function beatsToTransportPosition(beats: number, signature: TimeSignature): string {
  const safeBeats = Math.max(0, Number.isFinite(beats) ? beats : 0);
  const perBar = beatsPerBar(signature);
  let bars = Math.floor(safeBeats / perBar);
  let remainder = safeBeats - bars * perBar;
  let quarterBeats = Math.floor(remainder);
  let sixteenths = Math.round((remainder - quarterBeats) * 4);

  if (sixteenths === 4) {
    quarterBeats += 1;
    sixteenths = 0;
  }
  if (quarterBeats >= perBar) {
    bars += 1;
    quarterBeats = 0;
  }
  return `${bars}:${quarterBeats}:${sixteenths}`;
}

export function transportPositionToBeats(position: string | number, signature: TimeSignature): number {
  if (typeof position === 'number') return Math.max(0, position);
  const [bars = '0', quarterBeats = '0', sixteenths = '0'] = position.split(':');
  return Math.max(
    0,
    Number(bars) * beatsPerBar(signature) + Number(quarterBeats) + Number(sixteenths) / 4,
  );
}

export function beatsToSeconds(beats: number, bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Invalid BPM');
  return beats * 60 / bpm;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Invalid BPM');
  return seconds * bpm / 60;
}
