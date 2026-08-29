import { beforeEach, describe, expect, it } from 'vitest';
import { pluginInspectorStore } from './pluginInspectorStore';

describe('Plugin Inspector session state', () => {
  beforeEach(() => pluginInspectorStore.getState().reset());

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

  it('clamps width and keeps normal width while maximize is session-only', () => {
    const state = pluginInspectorStore.getState();
    expect(state.width).toBe(320);
    state.setWidth(120, 1_200);
    expect(pluginInspectorStore.getState().width).toBe(280);
    state.setWidth(900, 1_000);
    expect(pluginInspectorStore.getState().width).toBe(680);

    state.setMaximized(true);
    expect(pluginInspectorStore.getState().maximized).toBe(true);
    pluginInspectorStore.getState().close();
    expect(pluginInspectorStore.getState()).toMatchObject({ target: null, width: 680, maximized: false });
  });

  it('restores defaults explicitly without changing plugin targets implicitly', () => {
    pluginInspectorStore.getState().setWidth(500, 1_200);
    pluginInspectorStore.getState().setMaximized(true);
    pluginInspectorStore.getState().reset();
    expect(pluginInspectorStore.getState()).toMatchObject({ target: null, width: 320, maximized: false });
  });
});