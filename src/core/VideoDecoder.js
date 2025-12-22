export class VideoDecoder {
    constructor() {
        this.data = null;
        this.frameIndex = 0;
        this.isPlaying = false;
        this.startTime = 0;
    }

    async load(blob) {
        try {
            const text = await blob.text();

            // Validate: Check if it's JSON
            if (text.trim().startsWith('ASCV')) {
                throw new Error("Legacy 'ASCV' format detected. Please re-encode using the new engine.");
            }

            try {
                this.data = JSON.parse(text);
            } catch (e) {
                throw new Error("Invalid JSON format. File might be corrupted or not decompressed.");
            }

            if (!this.data.frames || !Array.isArray(this.data.frames)) {
                throw new Error("Invalid schema: 'frames' array missing.");
            }

            this.frameIndex = 0;
            console.log('Video/Image loaded', this.data.meta);
            return this.data.meta || { frameCount: this.data.frames.length };
        } catch (e) {
            console.error('Failed to load video', e);
            throw e; // Propagate for UI alert
        }
    }

    play(onFrame, onFinish) {
        if (!this.data) return;
        this.isPlaying = true;
        this.startTime = Date.now();

        // If single frame (Image), just render once
        if (this.data.frames.length === 1) {
            onFrame(this.data.frames[0].d);
            return;
        }

        this.loop(onFrame, onFinish);
    }

    pause() {
        this.isPlaying = false;
    }

    loop(onFrame, onFinish) {
        if (!this.isPlaying) return;

        // Fallback for duration if missing
        const duration = this.data.meta?.duration || (this.data.frames[this.data.frames.length - 1].t) + 100;
        if (duration <= 0) {
            onFrame(this.data.frames[0].d);
            return;
        }

        const currentTime = (Date.now() - this.startTime) % duration;

        // Find frame
        // This is a naive linear scan; sufficient for small clips.
        // For long movies, we'd want binary search.
        let currentFrame = this.data.frames[0];
        for (let i = 0; i < this.data.frames.length; i++) {
            if (this.data.frames[i].t > currentTime) {
                break;
            }
            currentFrame = this.data.frames[i];
        }

        if (currentFrame) {
            onFrame(currentFrame.d);
        }

        requestAnimationFrame(() => this.loop(onFrame, onFinish));
    }
}
