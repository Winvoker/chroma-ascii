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

            if (currentColors && lastColors) {
                for (let i = 0; i < currentColors.length; i++) {
                    if (currentColors[i] !== lastColors[i]) {
                        colorDiff.push(i, currentColors[i]);
                    }
                }
            }

            // Text Delta (Using Palette Indices)
            const currentIndices = frameData.charIndices;
            const lastIndices = this.lastFrameData.charIndices;

            for (let i = 0; i < currentIndices.length; i++) {
                if (currentIndices[i] !== lastIndices[i]) {
                    textDiff.push(i, currentIndices[i]); // Store index instead of char
                }
            }

            frameToStore = {
                t: time,
                type: 'd', // Delta frame
                cd: colorDiff.length > 0 ? colorDiff : undefined,
                id: textDiff.length > 0 ? textDiff : undefined // 'id' for Index Delta
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
                version: 4, // 8-bit (3-3-2) Color + Palette Indexing support
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
