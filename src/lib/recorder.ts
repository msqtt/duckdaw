import * as Tone from 'tone';

export interface MicRecordingResult {
    url: string;
    mimeType: string;
    durationSeconds: number;
}

export class MicRecorder {
    mediaRecorder: MediaRecorder | null = null;
    chunks: Blob[] = [];
    userMedia: Tone.UserMedia | null = null;
    inputMeter: Tone.Meter | null = null;
    nativeStream: MediaStream | null = null;
    nativeAnalyser: AnalyserNode | null = null;
    analyserData: Float32Array<ArrayBuffer> | null = null;
    startedAt = 0;
    private startOperation = 0;

    private releaseResources(
        userMedia: Tone.UserMedia | null,
        nativeStream: MediaStream | null,
        nativeAnalyser: AnalyserNode | null,
        inputMeter: Tone.Meter | null,
    ) {
        try {
            userMedia?.close();
        } catch {
            // Continue releasing the remaining resources.
        }
        nativeStream?.getTracks().forEach(track => track.stop());
        nativeAnalyser?.disconnect();
        inputMeter?.dispose();
    }

    private releaseInput() {
        this.releaseResources(this.userMedia, this.nativeStream, this.nativeAnalyser, this.inputMeter);
        this.userMedia = null;
        this.nativeStream = null;
        this.nativeAnalyser = null;
        this.analyserData = null;
        this.inputMeter = null;
    }

    async start(deviceId?: string) {
        const operation = ++this.startOperation;
        let pendingUserMedia: Tone.UserMedia | null = null;
        let pendingStream: MediaStream | null = null;
        try {
            let mediaRecorder: MediaRecorder;
            let pendingMeter: Tone.Meter | null = null;
            let pendingAnalyser: AnalyserNode | null = null;
            let pendingAnalyserData: Float32Array<ArrayBuffer> | null = null;

            if (deviceId) {
              pendingStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
              });
              if (operation !== this.startOperation) {
                pendingStream.getTracks().forEach(track => track.stop());
                throw new DOMException('Microphone start was cancelled', 'AbortError');
              }
              const ctx = Tone.getContext().rawContext as AudioContext;
              const source = ctx.createMediaStreamSource(pendingStream);
              pendingAnalyser = ctx.createAnalyser();
              pendingAnalyser.fftSize = 1024;
              pendingAnalyserData = new Float32Array(pendingAnalyser.fftSize);
              const dest = ctx.createMediaStreamDestination();
              source.connect(pendingAnalyser);
              source.connect(dest);
              mediaRecorder = new MediaRecorder(dest.stream);
            } else {
              pendingUserMedia = new Tone.UserMedia();
              await pendingUserMedia.open();
              if (operation !== this.startOperation) {
                pendingUserMedia.close();
                throw new DOMException('Microphone start was cancelled', 'AbortError');
              }
              pendingMeter = new Tone.Meter();
              pendingUserMedia.connect(pendingMeter);
              const dest = Tone.context.createMediaStreamDestination();
              pendingUserMedia.connect(dest);
              mediaRecorder = new MediaRecorder(dest.stream);
            }

            if (operation !== this.startOperation) {
              pendingUserMedia?.close();
              pendingStream?.getTracks().forEach(track => track.stop());
              pendingAnalyser?.disconnect();
              pendingMeter?.dispose();
              throw new DOMException('Microphone start was cancelled', 'AbortError');
            }

            this.releaseInput();
            this.userMedia = pendingUserMedia;
            this.nativeStream = pendingStream;
            this.nativeAnalyser = pendingAnalyser;
            this.analyserData = pendingAnalyserData;
            this.inputMeter = pendingMeter;
            this.mediaRecorder = mediaRecorder;
            const chunks: Blob[] = [];
            this.chunks = chunks;
            this.startedAt = performance.now();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.start();
        } catch (error) {
            pendingUserMedia?.close();
            pendingStream?.getTracks().forEach(track => track.stop());
            if (operation === this.startOperation) {
              this.releaseInput();
              this.mediaRecorder = null;
            }
            throw error;
        }
    }

    getInputLevelDb(): number {
        if (this.nativeAnalyser && this.analyserData) {
            this.nativeAnalyser.getFloatTimeDomainData(this.analyserData);
            let sum = 0;
            for (const sample of this.analyserData) sum += sample * sample;
            const rms = Math.sqrt(sum / this.analyserData.length);
            return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        }
        const value = this.inputMeter?.getValue();
        const level = Array.isArray(value) ? value[0] : value;
        return typeof level === 'number' ? level : -Infinity;
    }
    
    async stop(): Promise<MicRecordingResult | null> {
        this.startOperation += 1;
        return new Promise((resolve, reject) => {
            const mediaRecorder = this.mediaRecorder;
            if (!mediaRecorder || mediaRecorder.state === "inactive") {
                this.releaseInput();
                this.mediaRecorder = null;
                resolve(null);
                return;
            }

            const userMedia = this.userMedia;
            const nativeStream = this.nativeStream;
            const nativeAnalyser = this.nativeAnalyser;
            const inputMeter = this.inputMeter;
            const chunks = this.chunks;
            const startedAt = this.startedAt;

            this.mediaRecorder = null;
            this.userMedia = null;
            this.nativeStream = null;
            this.nativeAnalyser = null;
            this.analyserData = null;
            this.inputMeter = null;

            mediaRecorder.onstop = () => {
                const mimeType = mediaRecorder.mimeType || "audio/webm";
                const blob = new Blob(chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const durationSeconds = Math.max(0.01, (performance.now() - startedAt) / 1000);
                this.releaseResources(userMedia, nativeStream, nativeAnalyser, inputMeter);
                resolve({ url, mimeType, durationSeconds });
            };

            try {
                mediaRecorder.stop();
            } catch (error) {
                this.releaseResources(userMedia, nativeStream, nativeAnalyser, inputMeter);
                reject(error);
            }
        });
    }
}
