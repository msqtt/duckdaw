import { describe, expect, it } from 'vitest';
import type { PluginInstanceDescriptor } from './pluginSdk';
import { movePluginInChain } from './pluginUi';

const plugin = (id: string): PluginInstanceDescriptor => ({
  id,
  pluginId: `vendor.effect.${id}`,
  pluginVersion: '1.0.0',
  enabled: true,
  parameters: {},
});

describe('plugin chain UI ordering', () => {
  it('moves one descriptor without mutating the source order', () => {
    const source = [plugin('a'), plugin('b'), plugin('c')];
    const movedUp = movePluginInChain(source, 'b', 'up');
    const movedDown = movePluginInChain(movedUp, 'b', 'down');

    expect(movedUp.map(item => item.id)).toEqual(['b', 'a', 'c']);
    expect(movedDown.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(source.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same chain for missing IDs and boundary no-ops', () => {
    const source = [plugin('a'), plugin('b')];
    expect(movePluginInChain(source, 'missing', 'up')).toBe(source);
    expect(movePluginInChain(source, 'a', 'up')).toBe(source);
    expect(movePluginInChain(source, 'b', 'down')).toBe(source);
  });
});
