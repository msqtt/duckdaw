/**
 * REC-PRO-03: Input Level Meter with Clipping Announcements
 * Accessible meter component using aria-live for screen reader announcements.
 */
import React, { useCallback, useEffect, useState } from 'react';

export interface InputMeterProps {
  level: number;        // 0-127 for MIDI, dBFS for audio
  peak: number;         // peak hold
  isClipping: boolean;  // currently clipping
  type: 'audio' | 'midi';
  onClearClip?: () => void;
}

export function InputMeter({ level, peak, isClipping, type, onClearClip }: InputMeterProps) {
  const [announced, setAnnounced] = useState(false);

  // Normalize level to 0-100 for display
  const normalizedLevel = type === 'midi'
    ? Math.min(100, (level / 127) * 100)
    : Math.min(100, Math.max(0, (level + 60) / 60 * 100)); // -60dB to 0dB range

  const normalizedPeak = type === 'midi'
    ? Math.min(100, (peak / 127) * 100)
    : Math.min(100, Math.max(0, (peak + 60) / 60 * 100));

  // Announce each clipping episode once without updating state during render.
  const clipMessage = isClipping && !announced ? 'Input clipping detected' : '';
  useEffect(() => {
    setAnnounced(isClipping);
  }, [isClipping]);

  const handleClick = useCallback(() => {
    onClearClip?.();
    setAnnounced(false);
  }, [onClearClip]);

  return (
    <div
      className="relative flex items-center gap-1"
      role="meter"
      aria-label="Input level meter"
      aria-valuenow={Math.round(normalizedLevel)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Visual meter bar */}
      <div
        className={`relative h-4 w-20 rounded overflow-hidden border ${
          isClipping ? 'border-red-500' : 'border-gray-600'
        }`}
        onClick={handleClick}
        title={isClipping ? 'Clipping! Click to clear' : `Level: ${Math.round(normalizedLevel)}%`}
      >
        {/* Level fill */}
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-75 ${
            isClipping ? 'bg-red-500 animate-pulse' : 'bg-green-500'
          }`}
          style={{ width: `${normalizedLevel}%` }}
        />
        {/* Peak indicator */}
        <div
          className="absolute inset-y-0 w-0.5 bg-yellow-400"
          style={{ left: `${normalizedPeak}%` }}
        />
      </div>

      {/* Clipping indicator */}
      {isClipping && (
        <span className="text-xs text-red-500 font-bold" aria-hidden="true">
          CLIP
        </span>
      )}

      {/* Screen reader announcement */}
      <span role="status" aria-live="assertive" className="sr-only">
        {clipMessage}
      </span>
    </div>
  );
}
