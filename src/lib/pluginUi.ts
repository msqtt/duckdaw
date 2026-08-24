import type { PluginInstanceDescriptor } from './pluginSdk';

export type PluginMoveDirection = 'up' | 'down';

export function movePluginInChain(
  plugins: readonly PluginInstanceDescriptor[],
  pluginInstanceId: string,
  direction: PluginMoveDirection,
): PluginInstanceDescriptor[] | readonly PluginInstanceDescriptor[] {
  const index = plugins.findIndex(plugin => plugin.id === pluginInstanceId);
  if (index < 0) return plugins;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= plugins.length) return plugins;
  const next = [...plugins];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}
