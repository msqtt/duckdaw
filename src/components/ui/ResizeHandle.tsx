import React, { useRef } from 'react';

export function ResizeHandle({
  ariaLabel,
  value,
  min,
  max,
  side,
  onChange,
  className = '',
}: {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  side: 'left' | 'right';
  onChange: (value: number) => void;
  className?: string;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next)));

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={`touch-none select-none focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className}`}
      onKeyDown={event => {
        const step = event.shiftKey ? 64 : 16;
        const growKey = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const shrinkKey = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        if (event.key === growKey) { event.preventDefault(); onChange(clamp(value + step)); }
        if (event.key === shrinkKey) { event.preventDefault(); onChange(clamp(value - step)); }
        if (event.key === 'Home') { event.preventDefault(); onChange(min); }
        if (event.key === 'End') { event.preventDefault(); onChange(max); }
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const delta = event.clientX - current.startX;
        onChange(clamp(current.startValue + (side === 'right' ? delta : -delta)));
      }}
      onPointerUp={event => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => {
        if (drag.current?.pointerId === event.pointerId) drag.current = null;
      }}
    />
  );
}
