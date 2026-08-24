import React, { useEffect } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useDAWStore } from '../../store/dawStore';
import { usePluginInspectorStore } from '../../store/pluginInspectorStore';
import { getDefaultPluginRegistry } from '../../lib/pluginRuntime';
import type { PluginInstanceDescriptor, PluginParameterDefinition } from '../../lib/pluginSdk';
import type { AutomationTarget } from '../../lib/automation';
import { AutomationCreateButton } from './AutomationCreateButton';

const pluginRegistry = getDefaultPluginRegistry();

function ParameterEditor({
  plugin,
  parameter,
  onChange,
  automationOwner,
}: {
  plugin: PluginInstanceDescriptor;
  parameter: PluginParameterDefinition;
  onChange: (value: number | string) => void;
  automationOwner?: { trackId: string; trackName: string; pluginKind: 'instrument' | 'effect' };
  key?: React.Key;
}) {
  const value = plugin.parameters[parameter.id] ?? parameter.defaultValue;
  const target = automationOwner
    ? `${automationOwner.pluginKind}:${plugin.id}:${parameter.id}` as AutomationTarget
    : undefined;
  if (parameter.type === 'enum') {
    const numericValue = Math.max(0, parameter.values.indexOf(String(value)));
    return (
      <div className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-300">
        <span className="flex items-center justify-between font-medium">
          <span>{parameter.name}</span>
          {automationOwner && target && (
            <AutomationCreateButton
              trackId={automationOwner.trackId}
              trackName={automationOwner.trackName}
              binding={{
                target,
                label: parameter.name,
                range: { min: 0, max: parameter.values.length - 1 },
                valueType: 'discrete',
                values: [...parameter.values],
              }}
              currentValue={numericValue}
            />
          )}
        </span>
        <select
          aria-label={`${parameter.name} for ${plugin.pluginId}`}
          value={String(value)}
          onChange={event => onChange(event.target.value)}
          className="h-9 rounded-md border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-800"
        >
          {parameter.values.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    );
  }
  const numericValue = typeof value === 'number' ? value : parameter.defaultValue;
  return (
    <div className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-300">
      <span className="flex items-center justify-between font-medium">
        <span>{parameter.name}</span>
        <span className="ml-auto font-mono text-neutral-500">{numericValue}{parameter.unit ? ` ${parameter.unit}` : ''}</span>
        {automationOwner && target && (
          <AutomationCreateButton
            trackId={automationOwner.trackId}
            trackName={automationOwner.trackName}
            binding={{
              target,
              label: parameter.name,
              range: { min: parameter.min, max: parameter.max },
              valueType: 'continuous',
            }}
            currentValue={numericValue}
          />
        )}
      </span>
      <input
        type="range"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={numericValue}
        aria-label={`${parameter.name} for ${plugin.pluginId}`}
        onChange={event => onChange(Number(event.target.value))}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}

export function PluginInspector() {
  const target = usePluginInspectorStore(state => state.target);
  const close = usePluginInspectorStore(state => state.close);
  const { tracks, buses, updateTrack, updateBus } = useDAWStore(useShallow(state => ({
    tracks: state.tracks,
    buses: state.buses,
    updateTrack: state.updateTrack,
    updateBus: state.updateBus,
  })));

  const owner = target?.ownerType === 'track'
    ? tracks.find(track => track.id === target.ownerId)
    : target?.ownerType === 'bus'
      ? buses.find(bus => bus.id === target.ownerId)
      : undefined;
  const plugin = target?.kind === 'instrument' && target.ownerType === 'track'
    ? tracks.find(track => track.id === target.ownerId)?.instrumentPlugin
    : target?.kind === 'effect'
      ? (target.ownerType === 'track'
        ? tracks.find(track => track.id === target.ownerId)?.effectPlugins
        : buses.find(bus => bus.id === target.ownerId)?.effectPlugins)
        ?.find(item => item.id === target.pluginInstanceId)
      : undefined;

  useEffect(() => {
    if (target != null && (owner == null || plugin == null)) close();
  }, [close, owner, plugin, target]);

  if (target == null || owner == null || plugin == null) return null;
  const definition = pluginRegistry.get(plugin.pluginId);
  const expectedKind = target.kind;
  const available = definition?.kind === expectedKind;

  const updatePlugin = (next: PluginInstanceDescriptor) => {
    if (target.kind === 'instrument' && target.ownerType === 'track') {
      updateTrack(target.ownerId, { instrumentPlugin: next });
      return;
    }
    if (target.kind === 'effect') {
      if (target.ownerType === 'track') {
        const track = tracks.find(item => item.id === target.ownerId);
        if (!track) return;
        updateTrack(target.ownerId, {
          effectPlugins: (track.effectPlugins ?? []).map(item => item.id === next.id ? next : item),
        });
      } else {
        const bus = buses.find(item => item.id === target.ownerId);
        if (!bus) return;
        updateBus(target.ownerId, {
          effectPlugins: (bus.effectPlugins ?? []).map(item => item.id === next.id ? next : item),
        });
      }
    }
  };

  return (
    <aside
      role="complementary"
      aria-label="Plugin Inspector"
      className="w-80 shrink-0 border-l border-neutral-300 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col overflow-hidden"
    >
      <header className="h-12 shrink-0 border-b border-neutral-300 px-3 dark:border-neutral-800 flex items-center gap-2">
        <SlidersHorizontal size={16} className="text-emerald-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">{owner.name} · {target.kind}</div>
          <h2 className="truncate text-sm font-semibold">{available ? definition.name : `Unavailable: ${plugin.pluginId}`}</h2>
        </div>
        <button
          type="button"
          aria-label="Close plugin inspector"
          onClick={close}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
        ><X size={16} /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section className="rounded-lg border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-neutral-500 break-all">{plugin.pluginId}</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] dark:bg-neutral-800">v{plugin.pluginVersion}</span>
          </div>
          {target.kind === 'effect' && (
            <button
              type="button"
              aria-pressed={plugin.enabled}
              onClick={() => updatePlugin({ ...plugin, enabled: !plugin.enabled })}
              className={`mt-3 w-full rounded px-2 py-1.5 font-medium ${plugin.enabled ? 'bg-emerald-500/15 text-emerald-600' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800'}`}
            >{plugin.enabled ? 'Enabled' : 'Bypassed'}</button>
          )}
        </section>

        {available ? (
          <section className="space-y-4" aria-label={`${definition.name} parameters`}>
            {definition.parameters.length === 0 && <p className="text-xs text-neutral-500">This plugin has no editable parameters.</p>}
            {definition.parameters.map(parameter => (
              <ParameterEditor
                key={parameter.id}
                plugin={plugin}
                parameter={parameter}
                automationOwner={target.ownerType === 'track' ? {
                  trackId: target.ownerId,
                  trackName: owner.name,
                  pluginKind: target.kind,
                } : undefined}
                onChange={value => updatePlugin({
                  ...plugin,
                  parameters: { ...plugin.parameters, [parameter.id]: value },
                })}
              />
            ))}
          </section>
        ) : (
          <div role="status" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            The descriptor is preserved, but this plugin is not registered in the current build.
          </div>
        )}
      </div>
    </aside>
  );
}
