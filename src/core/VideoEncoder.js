export class VideoEncoder {
    constructor() {
        this.frames = [];
        this.isEncoding = false;
        this.lastFrameData = null;
        this.framesSinceKeyframe = 0;
        this.keyframeInterval = 30; // Every 30 frames is a full frame
    }

    start() {
        this.frames = [];
        this.isEncoding = true;
        this.lastFrameData = null;
        this.framesSinceKeyframe = 0;
    }

    addFrame(frameData, time) {
        if (!this.isEncoding) return;

        const isKeyframe = !this.lastFrameData ||
            this.framesSinceKeyframe >= this.keyframeInterval ||
            this.lastFrameData.width !== frameData.width ||
            this.lastFrameData.height !== frameData.height;

        let frameToStore;

        if (isKeyframe) {
            frameToStore = {
                t: time,
                type: 'f', // Full frame
                d: frameData
            };
            this.framesSinceKeyframe = 0;
        } else {
            // Compute Delta
            const colorDiff = [];
            const textDiff = [];

            // Colors Delta
            const currentColors = frameData.colors;
            const lastColors = this.lastFrameData.colors;
            for (let i = 0; i < currentColors.length; i++) {
                if (currentColors[i] !== lastColors[i]) {
                    colorDiff.push(i, currentColors[i]); // Flat array [idx, val, idx, val...]
                }
            }

            // Text Delta
            const currentText = frameData.text;
            const lastText = this.lastFrameData.text;
            // Note: We compare characters. Since strings are immutable we iterate.
            for (let i = 0; i < currentText.length; i++) {
                if (currentText[i] !== lastText[i]) {
                    textDiff.push(i, currentText[i]);
                }
            }

            frameToStore = {
                t: time,
                type: 'd', // Delta frame
                cd: colorDiff.length > 0 ? colorDiff : undefined,
                td: textDiff.length > 0 ? textDiff : undefined
            };
            this.framesSinceKeyframe++;
        }

        this.frames.push(frameToStore);
        this.lastFrameData = JSON.parse(JSON.stringify(frameData)); // Deep copy to keep state
    }

    async stopAndSave() {
        this.isEncoding = false;

        const data = {
            meta: {
                version: 2, // Color support
                date: new Date().toISOString(),
                frameCount: this.frames.length
            },
            frames: this.frames
        };

        const jsonStr = JSON.stringify(data);
        const blob = new Blob([jsonStr], { type: 'application/json' });

        try {
            const stream = new Response(blob).body.pipeThrough(new CompressionStream('gzip'));
            const compressedBlob = await new Response(stream).blob();
            return compressedBlob;
        } catch (e) {
            console.warn('CompressionStream failed', e);
            return blob;
        }
    }
}
