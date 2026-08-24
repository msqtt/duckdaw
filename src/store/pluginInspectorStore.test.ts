import { beforeEach, describe, expect, it } from 'vitest';
import { pluginInspectorStore } from './pluginInspectorStore';

describe('Plugin Inspector session state', () => {
  beforeEach(() => pluginInspectorStore.getState().close());

  it('opens instrument and effect targets without project persistence state', () => {
    pluginInspectorStore.getState().open({ ownerType: 'track', ownerId: 'track-1', kind: 'instrument' });
    expect(pluginInspectorStore.getState().target).toEqual({
      ownerType: 'track', ownerId: 'track-1', kind: 'instrument',
    });

    pluginInspectorStore.getState().open({
      ownerType: 'bus', ownerId: 'bus-1', kind: 'effect', pluginInstanceId: 'fx-1',
    });
    expect(pluginInspectorStore.getState().target).toEqual({
      ownerType: 'bus', ownerId: 'bus-1', kind: 'effect', pluginInstanceId: 'fx-1',
    });
  });

  it('closes idempotently', () => {
    pluginInspectorStore.getState().open({ ownerType: 'track', ownerId: 'track-1', kind: 'instrument' });
    pluginInspectorStore.getState().close();
    pluginInspectorStore.getState().close();
    expect(pluginInspectorStore.getState().target).toBeNull();
  });
});
