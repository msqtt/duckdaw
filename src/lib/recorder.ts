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
    startedAt = 0;
    
    async start() {
        if (!this.userMedia) {
            this.userMedia = new Tone.UserMedia();
        }
        await this.userMedia.open();
        
        // Connect to a destination that MediaRecorder can use
        const dest = Tone.context.createMediaStreamDestination();
        this.userMedia.connect(dest);
        
        this.mediaRecorder = new MediaRecorder(dest.stream);
        this.chunks = [];
        this.startedAt = performance.now();
        
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };
        
        this.mediaRecorder.start();
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
                resolve({ url, mimeType, durationSeconds });
            };
            
            this.mediaRecorder.stop();
        });
    }
}
