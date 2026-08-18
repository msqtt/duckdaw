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
    
    async start(deviceId?: string) {
        if (!this.userMedia) {
            this.userMedia = new Tone.UserMedia();
        }
        // If a specific device is requested, use native getUserMedia with exact deviceId
        if (deviceId) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId } },
          });
          this.nativeStream = stream;
          const ctx = Tone.getContext().rawContext as AudioContext;
          const source = ctx.createMediaStreamSource(stream);
          this.nativeAnalyser = ctx.createAnalyser();
          this.nativeAnalyser.fftSize = 1024;
          this.analyserData = new Float32Array(this.nativeAnalyser.fftSize);
          const dest = ctx.createMediaStreamDestination();
          source.connect(this.nativeAnalyser);
          source.connect(dest);
          this.mediaRecorder = new MediaRecorder(dest.stream);
        } else {
          await this.userMedia.open();
          this.inputMeter?.dispose();
          this.inputMeter = new Tone.Meter();
          this.userMedia.connect(this.inputMeter);
          // Connect to a destination that MediaRecorder can use
          const dest = Tone.context.createMediaStreamDestination();
          this.userMedia.connect(dest);
          this.mediaRecorder = new MediaRecorder(dest.stream);
        }
        
        this.chunks = [];
        this.startedAt = performance.now();
        
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };
        
        this.mediaRecorder.start();
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
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
                resolve(null);
                return;
            }
            
            this.mediaRecorder.onstop = () => {
                const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
                const blob = new Blob(this.chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const durationSeconds = Math.max(0.01, (performance.now() - this.startedAt) / 1000);
                this.userMedia?.close();
                this.nativeStream?.getTracks().forEach(track => track.stop());
                this.nativeStream = null;
                this.nativeAnalyser = null;
                this.analyserData = null;
                this.inputMeter?.dispose();
                this.inputMeter = null;
                resolve({ url, mimeType, durationSeconds });
            };
            
            this.mediaRecorder.stop();
        });
    }
}
