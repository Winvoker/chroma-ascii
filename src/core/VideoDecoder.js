export class VideoDecoder {
    constructor() {
        this.data = null;
        this.isPlaying = false;
        this.startTime = 0;

        // Reconstruction State
        this.reconstructedFrame = null;
        this.lastProcessedIndex = -1;
    }

    async load(blob) {
        try {
            const text = await blob.text();
            if (text.trim().startsWith('ASCV')) {
                throw new Error("Legacy 'ASCV' format detected. Please re-encode.");
            }

            try {
                this.data = JSON.parse(text);
            } catch (e) {
                throw new Error("Invalid JSON format.");
            }

            if (!this.data.frames || !Array.isArray(this.data.frames)) {
                throw new Error("Invalid schema.");
            }

            this.resetState();
            console.log('Video loaded', this.data.meta);
            return this.data.meta || { frameCount: this.data.frames.length };
        } catch (e) {
            console.error('Failed to load video', e);
            throw e;
        }
    }

    resetState() {
        this.reconstructedFrame = null;
        this.lastProcessedIndex = -1;
    }

    play(onFrame, onFinish) {
        if (!this.data) return;
        this.isPlaying = true;
        this.startTime = Date.now();
        this.resetState();

        if (this.data.frames.length === 1) {
            const f = this.data.frames[0];
            onFrame(f.type === 'f' ? f.d : f.d); // Should be full
            return;
        }

        this.loop(onFrame, onFinish);
    }

    pause() {
        this.isPlaying = false;
    }

    loop(onFrame, onFinish) {
        if (!this.isPlaying) return;

        const duration = this.data.meta?.duration || (this.data.frames[this.data.frames.length - 1].t) + 100;
        const currentTime = (Date.now() - this.startTime) % duration;

        // Find the index of the frame that should be playing
        let frameIndex = 0;
        for (let i = 0; i < this.data.frames.length; i++) {
            if (this.data.frames[i].t > currentTime) break;
            frameIndex = i;
        }

        // If we jumped backwards or too far ahead, we might need a full seek.
        // For simple playback, we ensure all intermediate deltas are applied.
        if (frameIndex < this.lastProcessedIndex) {
            this.resetState();
        }

        // Apply all frames from last processed up to current
        for (let i = this.lastProcessedIndex + 1; i <= frameIndex; i++) {
            const frame = this.data.frames[i];

            if (frame.type === 'f' || !frame.type) { // Full Frame
                // Deep copy to avoid mutating source data
                this.reconstructedFrame = JSON.parse(JSON.stringify(frame.d));
            } else if (frame.type === 'd' && this.reconstructedFrame) { // Delta Frame
                // Patch Colors
                if (frame.cd) {
                    for (let j = 0; j < frame.cd.length; j += 2) {
                        const idx = frame.cd[j];
                        const val = frame.cd[j + 1];
                        this.reconstructedFrame.colors[idx] = val;
                    }
                }
                // Patch Text
                if (frame.td) {
                    const textChars = Array.from(this.reconstructedFrame.text);
                    for (let j = 0; j < frame.td.length; j += 2) {
                        const idx = frame.td[j];
                        const val = frame.td[j + 1];
                        textChars[idx] = val;
                    }
                    this.reconstructedFrame.text = textChars.join('');
                }
            }
            this.lastProcessedIndex = i;
        }

        if (this.reconstructedFrame) {
            onFrame(this.reconstructedFrame);
        }

        requestAnimationFrame(() => this.loop(onFrame, onFinish));
    }
}
