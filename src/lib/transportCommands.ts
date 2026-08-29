import * as Tone from 'tone';
import { engine } from './audioEngine';
import { createTransportController } from './transportController';
import { dawStore } from '../store/dawStore';
import { registerProjectReplacementPreparation } from './projectReplacementRuntime';

export const transportController = createTransportController({
  getStatus: () => dawStore.getState().transportStatus,
  setStatus: status => dawStore.getState().setTransportStatus(status),
  isBusy: () => {
    const state = dawStore.getState();
    return state.isRecording || state.isMicRecording;
  },
  isContextRunning: () => Tone.context.state === 'running',
  initialize: () => engine.initialize(),
  play: () => engine.play(),
  pause: () => engine.pause(),
  stop: () => { engine.stop(); },
  stopSession: () => dawStore.getState().stop(),
});

registerProjectReplacementPreparation(async () => {
  engine.stop();
  dawStore.getState().stop();
});
