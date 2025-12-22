import { getBayerValue } from '../utils/BayerMatrix.js';

export class AsciiProcessor {
    constructor() {
        this.processCanvas = document.createElement('canvas');
        this.ctx = this.processCanvas.getContext('2d', { willReadFrequently: true });

        this.renderCanvas = null;
        this.renderCtx = null;
        this.source = null;
        this.isVideo = false;

        this.options = {
            resolution: 100,
            charSize: 10,
            charset: ' .:-=+*#%@',
            contrast: 0,
            gamma: 1.0,
            inverted: false,
            mode: 'grayscale',
            colorMode: 'color', // Default to color
            binaryThreshold: 128,
            binaryLight: '#',
            binaryDark: ' '
        };

        // Current Frame Data
        this.currentFrameData = null; // { text: string, colors: Uint32Array, width, height, mode, charSize }
    }

    setRenderCanvas(canvas) {
        this.renderCanvas = canvas;
        this.renderCtx = canvas.getContext('2d', { alpha: false });
    }

    setSource(source) {
        this.source = source;
        this.isVideo = (source.tagName === 'VIDEO');
    }

    applyGammaContrast(value, gamma, contrast) {
        let v = value / 255;
        v = Math.pow(v, 1 / gamma);
        const factor = 1 + (contrast / 100);
        v = ((v - 0.5) * factor) + 0.5;
        return Math.min(Math.max(v, 0), 1) * 255;
    }

    getBrightness(r, g, b, gamma, contrast, inverted) {
        let br = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        br = this.applyGammaContrast(br, gamma, contrast);
        if (inverted) br = 255 - br;
        return br;
    }

    process() {
        if (!this.source) return;

        const { resolution, mode } = this.options;

        // 1. Resize & Draw to Process Canvas
        const srcW = this.source.videoWidth || this.source.naturalWidth || 1;
        const srcH = this.source.videoHeight || this.source.naturalHeight || 1;

        let processWidth = resolution;
        let processHeight = Math.floor(resolution * (srcH / srcW) * 0.5);
        if (mode === 'block') processHeight = Math.floor(resolution * (srcH / srcW));

        if (this.processCanvas.width !== processWidth || this.processCanvas.height !== processHeight) {
            this.processCanvas.width = processWidth;
            this.processCanvas.height = processHeight;
        }

        this.ctx.drawImage(this.source, 0, 0, processWidth, processHeight);
        const imageData = this.ctx.getImageData(0, 0, processWidth, processHeight);
        const data = imageData.data;

        // 2. Process Pixels -> Chars & Colors
        const { charSize, charset, colorMode, gamma, contrast, inverted, binaryThreshold, binaryLight, binaryDark } = this.options;
        const charsetLen = charset.length;

        let text = '';
        // We use a flat text string for storage efficiency (if lines needed, we can split later or store width)
        // Actually, we need 2D data for color matching. 
        // Let's store colors in a flat array matching text length.
        // Block mode is special (2 pixels -> 1 char).

        const outputWidth = processWidth;
        const outputHeight = (mode === 'block') ? Math.ceil(processHeight / 2) : processHeight;

        // Color buffer: Packed RGB (0xRRGGBB). -1 for default/mono.
        const colors = new Int32Array(outputWidth * outputHeight);

        let charIndex = 0;

        const yStep = (mode === 'block') ? 2 : 1;

        for (let y = 0; y < processHeight; y += yStep) {
            for (let x = 0; x < processWidth; x++) {

                let charToDraw = ' ';
                let r = 0, g = 0, b = 0;
                let colorPacked = -1; // Default

                // --- Logic extraction ---
                if (mode === 'block') {
                    const offsetT = (y * processWidth + x) * 4;
                    const offsetB = (Math.min(y + 1, processHeight - 1) * processWidth + x) * 4;

                    const rT = data[offsetT]; const gT = data[offsetT + 1]; const bT = data[offsetT + 2];
                    const rB = data[offsetB]; const gB = data[offsetB + 1]; const bB = data[offsetB + 2];

                    let brT = this.getBrightness(rT, gT, bT, gamma, contrast, inverted);
                    let brB = this.getBrightness(rB, gB, bB, gamma, contrast, inverted);

                    const tOn = brT > 127.5;
                    const bOn = brB > 127.5;

                    if (tOn && bOn) charToDraw = '█';
                    else if (tOn && !bOn) charToDraw = '▀';
                    else if (!tOn && bOn) charToDraw = '▄';
                    else charToDraw = ' ';

                    if (colorMode === 'color') {
                        // Average color usually best for block? Or pick mostly lit?
                        // Simple average:
                        r = Math.round((rT + rB) / 2);
                        g = Math.round((gT + gB) / 2);
                        b = Math.round((bT + bB) / 2);
                        colorPacked = (r << 16) | (g << 8) | b;
                    }

                } else {
                    const offset = (y * processWidth + x) * 4;
                    r = data[offset]; g = data[offset + 1]; b = data[offset + 2];
                    let brightness = this.getBrightness(r, g, b, gamma, contrast, inverted);

                    if (mode === 'binary') {
                        const bayer = getBayerValue(x, y);
                        const dithered = brightness + ((bayer / 16) - 0.5) * 32;
                        charToDraw = dithered > binaryThreshold ? binaryLight : binaryDark;
                    } else if (mode === 'dither') {
                        const bayer = getBayerValue(x, y);
                        const t = (bayer + 0.5) / 16.0;
                        let idx = Math.floor(((brightness / 255) + (t - 0.5) / charsetLen) * (charsetLen - 1));
                        idx = Math.max(0, Math.min(idx, charsetLen - 1));
                        charToDraw = charset[idx];
                    } else { // Grayscale
                        let idx = Math.floor((brightness / 255) * (charsetLen - 1));
                        idx = Math.max(0, Math.min(idx, charsetLen - 1));
                        charToDraw = charset[idx];
                    }

                    if (colorMode === 'color') {
                        colorPacked = (r << 16) | (g << 8) | b;
                    }
                }

                text += charToDraw;
                colors[charIndex++] = colorPacked;
            }
            text += '\n'; // Marker for line break (optional, helps with simple text view)
            // Note: colors array is essentially 2D flattened, text has \n. 
            // We should be careful. 'render' needs to handle \n or we strip it?
            // Let's Keep \n in text for clipboard copy support, but 'colors' corresponds to visible chars.
        }

        this.currentFrameData = {
            text: text,
            colors: Array.from(colors), // Convert to array for JSON serialization later
            width: outputWidth,
            height: outputHeight,
            charSize: charSize,
            mode: mode
        };

        // 3. Render directly if we have a context
        if (this.renderCtx) {
            AsciiProcessor.drawFrame(this.renderCtx, this.currentFrameData);
        }
    }

    // Static drawer for use by Decoder too
    static drawFrame(ctx, frameData) {
        // Handle legacy format (just a string)
        if (typeof frameData === 'string') {
            const lines = frameData.split('\n').filter(l => l.length > 0);
            const width = lines.length > 0 ? lines[0].length : 0;
            const height = lines.length;
            frameData = {
                text: frameData,
                colors: new Array(width * height).fill(-1),
                width: width,
                height: height,
                charSize: 10
            };
        }

        if (!frameData || !frameData.text) {
            console.warn('Invalid frame data:', frameData);
            return;
        }

        // Handle missing colors (legacy format)
        if (!frameData.colors) {
            const textLen = frameData.text.replace(/\n/g, '').length;
            frameData.colors = new Array(textLen).fill(-1);
        }

        const { text, colors, width, height, charSize = 10 } = frameData;
        const canvas = ctx.canvas;

        // Calc dimensions
        const charW = charSize * 0.6;
        const charH = charSize;

        const targetW = Math.ceil(width * charW);
        const targetH = Math.ceil(height * charH);

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, targetW, targetH);

        ctx.font = `${charSize}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'top';


        let colorIndex = 0;
        let x = 0;
        let y = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\n') {
                x = 0;
                y++;
                continue;
            }

            const col = colors[colorIndex++];

            if (col === -1) {
                ctx.fillStyle = '#00ff88';
            } else {
                // Unpack
                const r = (col >> 16) & 0xFF;
                const g = (col >> 8) & 0xFF;
                const b = col & 0xFF;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
            }

            // Draw
            // Correction for block mode spacing?
            // The processor sends 'height' which handles the block compression.
            // We just draw grid.
            ctx.fillText(char, x * charW, y * charH);
            x++;
        }
    }
}
