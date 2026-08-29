import React, { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../../lib/audioEngine';
import {
  EQ_MAX_FREQUENCY,
  EQ_MAX_GAIN,
  EQ_MIN_FREQUENCY,
  EQ_MIN_GAIN,
  eqFrequencyToX,
  eqGainToY,
  eqXToFrequency,
  eqYToGain,
  readEqBands,
  updateEqBandParameters,
} from '../../lib/parametricEq';
import type { PluginInstanceDescriptor } from '../../lib/pluginSdk';
import { dawStore } from '../../store/dawStore';

const WIDTH = 600;
const HEIGHT = 260;

export function ParametricEqEditor({
  ownerType,
  ownerId,
  plugin,
  onChange,
}: {
  ownerType: 'track' | 'bus';
  ownerId: string;
  plugin: PluginInstanceDescriptor;
  onChange: (plugin: PluginInstanceDescriptor) => void;
}) {
  const [spectrum, setSpectrum] = useState<Float32Array | null>(null);
  const [selectedBand, setSelectedBand] = useState<number | null>(0);
  const [notice, setNotice] = useState('Click the graph to add a band, then drag points to shape the EQ.');
  const animationFrame = useRef(0);
  const dragCleanup = useRef<(() => void) | null>(null);
  const bands = readEqBands(plugin.parameters);
  const enabledBands = bands.filter(band => band.enabled);
  const selected = selectedBand == null ? undefined : bands[selectedBand];

  useEffect(() => {
    const update = () => {
      if (!document.hidden) {
        const values = engine.getEffectFrequencyData(ownerType, ownerId, plugin.id);
        setSpectrum(values ?? null);
      }
      animationFrame.current = requestAnimationFrame(update);
    };
    animationFrame.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(animationFrame.current);
      dragCleanup.current?.();
      dragCleanup.current = null;
    };
  }, [ownerId, ownerType, plugin.id]);

  const spectrumPath = useMemo(() => {
    if (spectrum == null || spectrum.length === 0) return '';
    const points: string[] = [];
    for (let index = 1; index < spectrum.length; index += 1) {
      const frequency = index / (spectrum.length - 1) * 24_000;
      if (frequency < EQ_MIN_FREQUENCY || frequency > EQ_MAX_FREQUENCY) continue;
      const x = eqFrequencyToX(frequency) * WIDTH;
      const normalized = Math.max(0, Math.min(1, (spectrum[index] + 100) / 100));
      const y = HEIGHT - normalized * HEIGHT;
      points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return points.join(' ');
  }, [spectrum]);

  const responsePath = useMemo(() => {
    const points: string[] = [];
    for (let index = 0; index <= 120; index += 1) {
      const x = index / 120;
      const frequency = eqXToFrequency(x);
      const gain = enabledBands.reduce((sum, band) => {
        const octaves = Math.log2(frequency / band.frequency);
        return sum + band.gain * Math.exp(-0.5 * Math.pow(octaves * Math.max(0.35, band.q), 2));
      }, 0);
      const y = eqGainToY(Math.max(EQ_MIN_GAIN, Math.min(EQ_MAX_GAIN, gain)));
      points.push(`${index === 0 ? 'M' : 'L'} ${(x * WIDTH).toFixed(1)} ${(y * HEIGHT).toFixed(1)}`);
    }
    return points.join(' ');
  }, [enabledBands]);

  const setBand = (index: number, updates: Parameters<typeof updateEqBandParameters>[2]) => {
    onChange({ ...plugin, parameters: updateEqBandParameters(plugin.parameters, index, updates) });
  };

  const addBandAt = (clientX: number, clientY: number, rect: DOMRect) => {
    const free = bands.find(band => !band.enabled);
    if (!free) {
      setNotice('The eight-band limit has been reached. Delete a point before adding another.');
      return;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    setBand(free.index, { enabled: true, frequency: eqXToFrequency(x), gain: eqYToGain(y), q: 1 });
    setSelectedBand(free.index);
    setNotice(`Band ${free.index + 1} added.`);
  };


  const beginSliderGesture = (
    event: React.PointerEvent<HTMLInputElement>,
    index: number,
    field: 'frequency' | 'gain' | 'q',
    min: number,
    max: number,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const original = { ...plugin.parameters };
    let final = original;
    dawStore.temporal.getState().pause();
    const move = (moveEvent: PointerEvent) => {
      const value = min + Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width)) * (max - min);
      final = updateEqBandParameters(original, index, { [field]: value });
      onChange({ ...plugin, parameters: final });
    };
    const removeListeners = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    const abort = () => {
      removeListeners();
      onChange({ ...plugin, parameters: original });
      dawStore.temporal.getState().resume();
    };
    const finish = () => {
      removeListeners();
      dragCleanup.current = null;
      onChange({ ...plugin, parameters: original });
      dawStore.temporal.getState().resume();
      if (JSON.stringify(final) !== JSON.stringify(original)) onChange({ ...plugin, parameters: final });
    };
    dragCleanup.current = abort;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
  return (
    <section className="space-y-3" aria-label="Spectrum Parametric EQ editor" data-testid="parametric-eq-editor">
      <div className="overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          tabIndex={0}
          aria-label="EQ frequency response graph. Click or press Enter to add a band."
          className="h-64 w-full touch-none"
          onKeyDown={event => {
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            addBandAt(rect.left + rect.width / 2, rect.top + rect.height / 2, rect);
          }}
          onPointerDown={event => {
            if (event.button !== 0 || event.target !== event.currentTarget) return;
            addBandAt(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
          }}
        >
          <rect width={WIDTH} height={HEIGHT} fill="#09090b" pointerEvents="none" />
          {[0, 0.25, 0.5, 0.75, 1].map(value => <line key={`h-${value}`} x1="0" x2={WIDTH} y1={value * HEIGHT} y2={value * HEIGHT} stroke="#27272a" pointerEvents="none" />)}
          {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map(frequency => (
            <g key={frequency} pointerEvents="none">
              <line x1={eqFrequencyToX(frequency) * WIDTH} x2={eqFrequencyToX(frequency) * WIDTH} y1="0" y2={HEIGHT} stroke="#27272a" />
              <text x={eqFrequencyToX(frequency) * WIDTH + 3} y={HEIGHT - 5} fill="#71717a" fontSize="11">{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</text>
            </g>
          ))}
          {spectrumPath && <path data-testid="eq-spectrum-path" d={spectrumPath} fill="none" stroke="#0ea5e9" strokeOpacity="0.6" strokeWidth="1.5" pointerEvents="none" />}
          <path data-testid="eq-response-path" d={responsePath} fill="none" stroke="#34d399" strokeWidth="3" pointerEvents="none" />
          {enabledBands.map(band => (
            <circle
              key={band.index}
              cx={eqFrequencyToX(band.frequency) * WIDTH}
              cy={eqGainToY(band.gain) * HEIGHT}
              r={selectedBand === band.index ? 9 : 7}
              fill={selectedBand === band.index ? '#fbbf24' : '#10b981'}
              stroke="white"
              strokeWidth="2"
              role="button"
              tabIndex={0}
              aria-label={`EQ band ${band.index + 1}, ${Math.round(band.frequency)} hertz, ${band.gain.toFixed(1)} decibels`}
              onClick={event => { event.stopPropagation(); setSelectedBand(band.index); }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBand(band.index); }
                const frequencyStep = event.shiftKey ? 0.1 : 0.02;
                if (event.key === 'ArrowLeft') setBand(band.index, { frequency: band.frequency * Math.pow(10, -frequencyStep) });
                if (event.key === 'ArrowRight') setBand(band.index, { frequency: band.frequency * Math.pow(10, frequencyStep) });
                if (event.key === 'ArrowUp') setBand(band.index, { gain: band.gain + 0.5 });
                if (event.key === 'ArrowDown') setBand(band.index, { gain: band.gain - 0.5 });
              }}
              onPointerDown={event => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const original = { ...plugin.parameters };
                let final = original;
                setSelectedBand(band.index);
                dawStore.temporal.getState().pause();
                const move = (moveEvent: PointerEvent) => {
                  const frequency = eqXToFrequency((moveEvent.clientX - rect.left) / rect.width);
                  const gain = eqYToGain((moveEvent.clientY - rect.top) / rect.height);
                  final = updateEqBandParameters(original, band.index, { frequency, gain });
                  onChange({ ...plugin, parameters: final });
                };
                const removeListeners = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', finish);
                  window.removeEventListener('pointercancel', finish);
                };
                const abort = () => {
                  removeListeners();
                  onChange({ ...plugin, parameters: original });
                  dawStore.temporal.getState().resume();
                };
                const finish = () => {
                  removeListeners();
                  dragCleanup.current = null;
                  onChange({ ...plugin, parameters: original });
                  dawStore.temporal.getState().resume();
                  if (JSON.stringify(final) !== JSON.stringify(original)) onChange({ ...plugin, parameters: final });
                };
                dragCleanup.current = abort;
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', finish);
                window.addEventListener('pointercancel', finish);
              }}
            />
          ))}
        </svg>
      </div>
      <p role="status" aria-live="polite" className="text-[10px] text-neutral-500">{spectrum == null ? 'Spectrum waiting for realtime audio. ' : 'Realtime spectrum active. '}{notice}</p>
      {selected?.enabled && <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between"><strong>Band {selected.index + 1}</strong><button type="button" onClick={() => { setBand(selected.index, { enabled: false }); setSelectedBand(null); }} className="rounded bg-red-500/10 px-2 py-1 text-red-500">Delete point</button></div>
        <label className="flex flex-col gap-1">Frequency <span className="font-mono">{Math.round(selected.frequency)} Hz</span><input type="range" min={EQ_MIN_FREQUENCY} max={EQ_MAX_FREQUENCY} step="1" value={selected.frequency} onPointerDown={event => beginSliderGesture(event, selected.index, 'frequency', EQ_MIN_FREQUENCY, EQ_MAX_FREQUENCY)} onChange={event => setBand(selected.index, { frequency: Number(event.target.value) })} className="accent-emerald-500" /></label>
        <label className="flex flex-col gap-1">Gain <span className="font-mono">{selected.gain.toFixed(1)} dB</span><input type="range" min={EQ_MIN_GAIN} max={EQ_MAX_GAIN} step="0.1" value={selected.gain} onPointerDown={event => beginSliderGesture(event, selected.index, 'gain', EQ_MIN_GAIN, EQ_MAX_GAIN)} onChange={event => setBand(selected.index, { gain: Number(event.target.value) })} className="accent-emerald-500" /></label>
        <label className="flex flex-col gap-1">Q <span className="font-mono">{selected.q.toFixed(1)}</span><input type="range" min="0.1" max="18" step="0.1" value={selected.q} onPointerDown={event => beginSliderGesture(event, selected.index, 'q', 0.1, 18)} onChange={event => setBand(selected.index, { q: Number(event.target.value) })} className="accent-emerald-500" /></label>
      </div>}
    </section>
  );
}
