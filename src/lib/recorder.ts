import * as Tone from 'tone';

export class MicRecorder {
    mediaRecorder: MediaRecorder | null = null;
    chunks: Blob[] = [];
    userMedia: Tone.UserMedia | null = null;
    
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
        
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };
        
        this.mediaRecorder.start();
    }
    
    async stop(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
                resolve("");
                return;
            }
            
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: "audio/webm" });
                const url = URL.createObjectURL(blob);
                this.userMedia?.close();
                resolve(url);
            };
            
            this.mediaRecorder.stop();
        });
    }
}
