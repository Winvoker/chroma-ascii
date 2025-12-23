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
            brightness: 0,
            exposure: 1.0,
            contrast: 0,
            gamma: 1.0,
            inverted: false,
            mode: 'grayscale',
            colorMode: 'color',
            colorDepth: 8, // New: 4, 8, 12, or 24
            binaryThreshold: 128,
            binaryLight: '1',
            binaryDark: '0'
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

    applyGammaContrast(value, gamma, contrast, brightness, exposure) {
        let v = value / 255;

        // 1. Exposure
        v = v * exposure;

        // 2. Brightness
        v = v + (brightness / 100);

        // 3. Gamma
        v = Math.pow(Math.max(v, 0), 1 / gamma);

        // 4. Contrast
        const factor = 1 + (contrast / 100);
        v = ((v - 0.5) * factor) + 0.5;

        return Math.min(Math.max(v, 0), 1) * 255;
    }

    getBrightness(r, g, b, gamma, contrast, inverted, brightness, exposure) {
        let br = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        br = this.applyGammaContrast(br, gamma, contrast, brightness, exposure);
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
        let colors = (colorMode === 'color') ? new Int32Array(outputWidth * outputHeight) : null;
        const charIndices = []; // New buffer for palette indexing

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

                    let brT = this.getBrightness(rT, gT, bT, gamma, contrast, inverted, this.options.brightness, this.options.exposure);
                    let brB = this.getBrightness(rB, gB, bB, gamma, contrast, inverted, this.options.brightness, this.options.exposure);

                    const tOn = brT > 127.5;
                    const bOn = brB > 127.5;

                    if (tOn && bOn) charToDraw = '█';
                    else if (tOn && !bOn) charToDraw = '▀';
                    else if (!tOn && bOn) charToDraw = '▄';
                    else charToDraw = ' ';

                    if (colorMode === 'color') {
                        const depth = this.options.colorDepth;
                        if (depth === 4) {
                            const r1 = (rT >> 7); const g2 = (gT >> 6); const b1 = (bT >> 7);
                            colorPacked = (r1 << 3) | (g2 << 1) | b1;
                        } else if (depth === 8) {
                            const r3 = (rT >> 5); const g3 = (gT >> 5); const b2 = (bT >> 6);
                            colorPacked = (r3 << 5) | (g3 << 2) | b2;
                        } else if (depth === 12) {
                            const r4 = (rT >> 4); const g4 = (gT >> 4); const b4 = (bT >> 4);
                            colorPacked = (r4 << 8) | (g4 << 4) | b4;
                        } else {
                            colorPacked = (rT << 16) | (gT << 8) | bT;
                        }
                    }

                    // Special indices for block mode
                    let idx = tOn + (bOn << 1);
                    charIndices.push(idx);

                    // We need a custom charset for block mode to map indices 0,1,2,3
                    this.currentBlockCharset = ' ▀▄█';
                } else {
                    const offset = (y * processWidth + x) * 4;
                    r = data[offset]; g = data[offset + 1]; b = data[offset + 2];
                    let brightness = this.getBrightness(r, g, b, gamma, contrast, inverted, this.options.brightness, this.options.exposure);

                    let idx = 0;
                    if (mode === 'binary') {
                        const bayer = getBayerValue(x, y);
                        const dithered = brightness + ((bayer / 16) - 0.5) * 32;
                        idx = dithered > binaryThreshold ? 1 : 0;
                        charToDraw = idx === 1 ? binaryLight : binaryDark;

                        this.currentBinaryCharset = binaryDark + binaryLight;
                    } else if (mode === 'dither') {
                        const bayer = getBayerValue(x, y);
                        const t = (bayer + 0.5) / 16.0;
                        idx = Math.floor(((brightness / 255) + (t - 0.5) / charsetLen) * (charsetLen - 1));
                        idx = Math.max(0, Math.min(idx, charsetLen - 1));
                        charToDraw = charset[idx];
                    } else { // Grayscale
                        idx = Math.floor((brightness / 255) * (charsetLen - 1));
                        idx = Math.max(0, Math.min(idx, charsetLen - 1));
                        charToDraw = charset[idx];
                    }

                    if (colorMode === 'color') {
                        const depth = this.options.colorDepth;
                        if (depth === 4) {
                            const r1 = (r >> 7); const g2 = (g >> 6); const b1 = (b >> 7);
                            colorPacked = (r1 << 3) | (g2 << 1) | b1;
                        } else if (depth === 8) {
                            const r3 = (r >> 5); const g3 = (g >> 5); const b2 = (b >> 6);
                            colorPacked = (r3 << 5) | (g3 << 2) | b2;
                        } else if (depth === 12) {
                            const r4 = (r >> 4); const g4 = (g >> 4); const b4 = (b >> 4);
                            colorPacked = (r4 << 8) | (g4 << 4) | b4;
                        } else {
                            colorPacked = (r << 16) | (g << 8) | b;
                        }
                    }

                    charIndices.push(idx);
                }

                text += charToDraw;
                if (colors) colors[charIndex++] = colorPacked;
            }
            text += '\n';
        }

        let finalCharset = charset;
        if (mode === 'block') finalCharset = ' ▀▄█';
        if (mode === 'binary') finalCharset = binaryDark + binaryLight;

        this.currentFrameData = {
            text: text,
            charIndices: charIndices,
            colors: colors ? Array.from(colors) : null,
            width: outputWidth,
            height: outputHeight,
            charSize: charSize,
            mode: mode,
            colorDepth: this.options.colorDepth,
            colorMode: this.options.colorMode,
            charset: finalCharset,
            resolution: this.options.resolution,
            height: this.options.resolution * (this.processCanvas.height / this.processCanvas.width)
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

            const col = colors ? colors[colorIndex++] : -1;
            const colorMode = frameData.colorMode || 'mono';

            if (colorMode === 'rainbow') {
                const res = frameData.resolution || 100;
                // Proportional rainbow: x determines base hue, y adds a slight wave
                const hue = ((x / res) * 360 + (y * 2)) % 360;
                ctx.fillStyle = `hsl(${hue}, 90%, 65%)`;
            } else if (col === -1) {
                ctx.fillStyle = '#00ff88';
            } else {
                const depth = frameData.colorDepth || 12;
                let r, g, b;

                if (depth === 4) {
                    r = ((col >> 3) & 0x1) * 255;
                    g = ((col >> 1) & 0x3) * 85;
                    b = (col & 0x1) * 255;
                } else if (depth === 8) {
                    r = ((col >> 5) & 0x7) * 36;
                    g = ((col >> 2) & 0x7) * 36;
                    b = (col & 0x3) * 85;
                } else if (depth === 12) {
                    r = ((col >> 8) & 0xF) * 17;
                    g = ((col >> 4) & 0xF) * 17;
                    b = (col & 0xF) * 17;
                } else {
                    r = (col >> 16) & 0xFF;
                    g = (col >> 8) & 0xFF;
                    b = col & 0xFF;
                }
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
