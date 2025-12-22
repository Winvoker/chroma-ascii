export const Compression = {
    // Estimate UTF-8 byte size
    utf8ByteSize(str) {
        return new Blob([str]).size;
    },

    // Estimate GZIP size (heuristic, approx 30-40% of ASCII usually, or we can actually compress a chunk)
    async estimateGzipSize(str) {
        if (!str) return 0;
        try {
            const blob = new Blob([str]);
            const stream = new Response(blob).body.pipeThrough(new CompressionStream('gzip'));
            const compressedBlob = await new Response(stream).blob();
            return compressedBlob.size;
        } catch (e) {
            return Math.floor(this.utf8ByteSize(str) * 0.4); // Fallback estimate
        }
    }
};
