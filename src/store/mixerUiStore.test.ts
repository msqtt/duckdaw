import { beforeEach, describe, expect, it } from 'vitest';
import { mixerUiStore } from './mixerUiStore';

describe('Mixer workspace session state', () => {
  beforeEach(() => mixerUiStore.getState().reset());

  it('keeps routing closed by default and clamps independent zoom/expanded state', () => {
    expect(mixerUiStore.getState()).toMatchObject({
      routingOpen: false,
      routingExpanded: false,
      routingZoom: 1,
    });
    mixerUiStore.getState().toggleRouting();
    mixerUiStore.getState().setRoutingExpanded(true);
    mixerUiStore.getState().setRoutingZoom(4);
    expect(mixerUiStore.getState()).toMatchObject({
      routingOpen: true,
      routingExpanded: true,
      routingZoom: 1.5,
    });
    mixerUiStore.getState().closeRouting();
    expect(mixerUiStore.getState()).toMatchObject({
      routingOpen: false,
      routingExpanded: false,
      routingZoom: 1.5,
    });
  });

  it('clamps track widths independently and releases deleted track state', () => {
    const state = mixerUiStore.getState();
    state.setTrackWidth('track-a', 400);
    state.setTrackWidth('track-b', 64);
    expect(mixerUiStore.getState().trackWidths).toEqual({ 'track-a': 320, 'track-b': 128 });
    mixerUiStore.getState().removeTrackWidth('track-a');
    expect(mixerUiStore.getState().trackWidths).toEqual({ 'track-b': 128 });
  });
});
