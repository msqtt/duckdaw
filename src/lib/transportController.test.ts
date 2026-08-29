import { describe, expect, it, vi } from 'vitest';
import { createTransportController, type TransportStatus } from './transportController';
import { dawStore } from '../store/dawStore';

function setup(initial: TransportStatus = 'stopped', busy = false, contextRunning = true) {
  let status = initial;
  const dependencies = {
    getStatus: () => status,
    setStatus: vi.fn((next: TransportStatus) => { status = next; }),
    isBusy: () => busy,
    isContextRunning: () => contextRunning,
    initialize: vi.fn(async () => { contextRunning = true; }),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    stopSession: vi.fn(),
  };
  return { controller: createTransportController(dependencies), dependencies, getStatus: () => status };
}

describe('FR-TRN-07 transport controller', () => {
  it('makes repeated idle Stop a strict audio and session no-op', () => {
    const { controller, dependencies } = setup('stopped', false);
    expect(controller.stopPlayback()).toBe(false);
    expect(controller.stopPlayback()).toBe(false);
    expect(dependencies.stop).not.toHaveBeenCalled();
    expect(dependencies.stopSession).not.toHaveBeenCalled();
    expect(dependencies.setStatus).not.toHaveBeenCalled();
  });

  it('plays, pauses, resumes, and stops with truthful explicit states', async () => {
    const { controller, dependencies, getStatus } = setup('stopped', false, false);
    await controller.togglePlayback();
    expect(dependencies.initialize).toHaveBeenCalledOnce();
    expect(dependencies.play).toHaveBeenCalledOnce();
    expect(getStatus()).toBe('playing');

    await controller.togglePlayback();
    expect(dependencies.pause).toHaveBeenCalledOnce();
    expect(getStatus()).toBe('paused');

    await controller.togglePlayback();
    expect(dependencies.play).toHaveBeenCalledTimes(2);
    expect(getStatus()).toBe('playing');

    expect(controller.stopPlayback()).toBe(true);
    expect(dependencies.stop).toHaveBeenCalledOnce();
    expect(dependencies.stopSession).toHaveBeenCalledOnce();
    expect(getStatus()).toBe('stopped');
  });

  it('cancels an active recording session without touching an already stopped Tone transport', () => {
    const { controller, dependencies } = setup('stopped', true);
    expect(controller.stopPlayback()).toBe(true);
    expect(dependencies.stop).not.toHaveBeenCalled();
    expect(dependencies.stopSession).toHaveBeenCalledOnce();
  });

  it('keeps transport runtime transitions out of project undo history', () => {
    dawStore.temporal.getState().clear();

    dawStore.getState().setTransportStatus('playing');
    dawStore.getState().stop();

    expect(dawStore.temporal.getState().pastStates).toHaveLength(0);
  });
});
