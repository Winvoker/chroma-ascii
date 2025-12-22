export class VideoEncoder {
    constructor() {
        this.frames = [];
        this.isEncoding = false;
        this.onProgress = null;
    }

    start() {
        this.frames = [];
        this.isEncoding = true;
    }

    // frameData is now an object: { text, colors, width, height, charSize, mode }
    addFrame(frameData, time) {
        if (!this.isEncoding) return;

        // Optimization: We could delta-compress colors?
        // For now, raw storage (Array of Ints) is fine for GZIP.
        // We strip 'text' of newlines if we want? No, keep it simple.

        // Store only essential per-frame data. 
        // Resolution/charSize might be constant, but mode could change? 
        // Let's assume constant metadata for now, OR store per frame.
        // To be safe and identical to preview, store full object.
        this.frames.push({
            t: time,
            d: frameData
        });
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
