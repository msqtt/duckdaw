export interface AudioRecordingPlaybackDependencies {
  startCapture: () => Promise<void>;
  cancelCapture?: () => Promise<void> | void;
  rollbackPlaybackOnAbort?: () => Promise<void> | void;
  isRecordingArmed?: () => boolean;
  getCurrentBeat: () => number;
  isPlaybackActive: () => boolean;
  startPlayback: () => void;
}

/**
 * REC-PRO-05: begin capture before anchoring the clip or starting Transport.
 * This keeps an already-running Transport uninterrupted and prevents permission
 * latency from shifting the recorded clip earlier than the captured audio.
 */
export async function startAudioRecordingWithPlayback({
  startCapture,
  cancelCapture,
  rollbackPlaybackOnAbort,
  isRecordingArmed = () => true,
  getCurrentBeat,
  isPlaybackActive,
  startPlayback,
}: AudioRecordingPlaybackDependencies): Promise<number | null> {
  try {
    await startCapture();

    if (!isRecordingArmed()) {
      try {
        await cancelCapture?.();
      } finally {
        await rollbackPlaybackOnAbort?.();
      }
      return null;
    }

    const startBeat = getCurrentBeat();
    if (!isPlaybackActive()) startPlayback();
    return startBeat;
  } catch (error) {
    await rollbackPlaybackOnAbort?.();
    throw error;
  }
}
