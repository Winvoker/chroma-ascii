import { AsciiProcessor } from '../core/AsciiProcessor.js';
import { VideoEncoder } from '../core/VideoEncoder.js';
import { VideoDecoder } from '../core/VideoDecoder.js';

class ImageApp {
    constructor() {
        this.processor = new AsciiProcessor();
        this.encoder = new VideoEncoder();
        this.decoder = new VideoDecoder();
        this.currentMode = 'encoder'; // 'encoder' or 'decoder'
        this.hasSource = false;
        this.hasDecodedData = false;

        this.elements = {
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('file-input'),
            sourceImage: document.getElementById('source-image'),
            asciiContainer: document.getElementById('ascii-container'),
            asciiCanvas: document.getElementById('ascii-canvas'),
            controlsContainer: document.getElementById('controls-container'),
            outputStats: document.getElementById('output-stats'),
            statusBar: document.getElementById('status-bar')
        };

        // Set up canvases
        this.encoderCanvas = this.elements.asciiCanvas;
        this.processor.setRenderCanvas(this.encoderCanvas);

        this.decoderCanvas = document.createElement('canvas');
        this.decoderCtx = this.decoderCanvas.getContext('2d', { alpha: false });
    }

    init() {
        this.setupDragAndDrop();
        this.renderControls();
        console.log('Image App initialized');
    }

    setupDragAndDrop() {
        const { dropZone, fileInput } = this.elements;

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.loadFile(file);
            e.target.value = '';
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragging');
        });

        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
                dropZone.classList.remove('dragging');
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragging');
            const file = e.dataTransfer.files[0];
            if (file) this.loadFile(file);
        });
    }

    loadFile(file) {
        const url = URL.createObjectURL(file);
        const { sourceImage, dropZone } = this.elements;

        // Reset state
        sourceImage.hidden = true;
        this.decoder.pause();
        this.processor.source = null;
        this.hasSource = false;
        this.hasDecodedData = false;

        const isAscii = file.name.endsWith('.ascv') || file.name.endsWith('.gz') ||
            file.name.endsWith('.json') || file.type === 'application/json';
        const isImage = file.type.startsWith('image/') ||
            ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].some(ext =>
                file.name.toLowerCase().endsWith(ext));

        if (isAscii) {
            this.switchMode('decoder');
            dropZone.style.display = 'none';
            this.elements.statusBar.textContent = 'Loading...';

            const handleError = (e) => {
                console.error(e);
                alert('Load failed: ' + e.message);
                dropZone.style.display = 'flex';
                this.elements.statusBar.textContent = 'Ready';
                this.hasDecodedData = false;
                this.renderControls();
            };

            const loadData = (blob) => {
                this.decoder.load(blob).then(meta => {
                    this.hasDecodedData = true;
                    this.elements.statusBar.textContent = `Loaded Image: ${meta.frameCount} frame(s)`;

                    // Render the first (and only) frame
                    this.decoder.play((frame) => {
                        if (frame) {
                            AsciiProcessor.drawFrame(this.decoderCtx, frame);
                            this.updateDecoderStats(frame);
                        }
                    }, () => { });

                    this.renderControls();
                }).catch(handleError);
            };

            if (file.name.endsWith('.gz') || file.type === 'application/x-gzip') {
                try {
                    const ds = new DecompressionStream('gzip');
                    const stream = file.stream().pipeThrough(ds);
                    new Response(stream).blob().then(blob => loadData(blob)).catch(handleError);
                } catch (e) { handleError(e); }
            } else {
                loadData(file);
            }
        } else if (isImage) {
            this.switchMode('encoder');
            dropZone.style.display = 'none';
            sourceImage.src = url;
            sourceImage.hidden = false;
            sourceImage.onload = () => {
                this.processor.setSource(sourceImage);
                this.hasSource = true;
                this.processor.process();
                this.elements.statusBar.textContent = `Source: ${file.name}`;
                this.updateEncoderStats();
                this.renderControls();
                this.updateEstimation(); // Force calculation on load
            };
            sourceImage.onerror = () => {
                alert('Error loading image');
                dropZone.style.display = 'flex';
                this.hasSource = false;
                this.renderControls();
            };
        } else {
            alert('Please use an image file or .ascv file');
        }
    }

    switchMode(mode) {
        this.currentMode = mode;
        const { asciiContainer, dropZone } = this.elements;

        // Clear and swap canvas
        asciiContainer.innerHTML = '';

        if (mode === 'encoder') {
            asciiContainer.appendChild(this.encoderCanvas);
            dropZone.style.display = this.hasSource ? 'none' : 'flex';
        } else {
            asciiContainer.appendChild(this.decoderCanvas);
            dropZone.style.display = this.hasDecodedData ? 'none' : 'flex';
        }

        this.renderControls();
    }

    updateEncoderStats() {
        if (this.processor.currentFrameData) {
            const { width, height } = this.processor.currentFrameData;
            this.elements.outputStats.textContent = `${width}x${height}`;
        }
    }

    updateDecoderStats(frame) {
        if (frame) {
            this.elements.outputStats.textContent = `${frame.width}x${frame.height}`;
        }
    }

    renderControls() {
        const container = this.elements.controlsContainer;
        container.innerHTML = '';

        // Mode Toggle Tabs
        const tabContainer = document.createElement('div');
        tabContainer.className = 'tab-container';

        const btnEnc = document.createElement('button');
        btnEnc.textContent = '🎨 Encoder';
        btnEnc.className = this.currentMode === 'encoder' ? 'tab-btn active' : 'tab-btn';
        btnEnc.onclick = () => this.switchMode('encoder');

        const btnDec = document.createElement('button');
        btnDec.textContent = '📖 Decoder';
        btnDec.className = this.currentMode === 'decoder' ? 'tab-btn active' : 'tab-btn';
        btnDec.onclick = () => this.switchMode('decoder');

        tabContainer.appendChild(btnEnc);
        tabContainer.appendChild(btnDec);
        container.appendChild(tabContainer);

        if (this.currentMode === 'decoder') {
            this.renderDecoderControls(container);
        } else {
            this.renderEncoderControls(container);
        }
    }

    renderDecoderControls(container) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'control-group';
        infoDiv.innerHTML = `
            <h4>Decoder Mode</h4>
            <p style="color: #888; font-size: 12px; margin: 8px 0;">
                Load .ascv or .ascv.gz files to view colored ASCII art.
            </p>
        `;
        container.appendChild(infoDiv);

        if (this.hasDecodedData) {
            // Download buttons section
            const exportSection = document.createElement('div');
            exportSection.className = 'control-group';
            exportSection.innerHTML = '<h4>Download</h4>';

            const downloadPngBtn = document.createElement('button');
            downloadPngBtn.textContent = '📥 Download as PNG';
            downloadPngBtn.className = 'primary';
            downloadPngBtn.onclick = () => this.downloadDecodedAsPng();
            exportSection.appendChild(downloadPngBtn);

            container.appendChild(exportSection);
        }

        // Reset button
        const resetSection = document.createElement('div');
        resetSection.className = 'control-group';

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄 Load New File';
        resetBtn.onclick = () => this.reset();
        resetSection.appendChild(resetBtn);
        container.appendChild(resetSection);
    }

    renderEncoderControls(container) {
        // Settings Section
        const settingsSection = document.createElement('div');
        settingsSection.className = 'control-group';
        settingsSection.innerHTML = '<h4>Settings</h4>';

        // Mode Select
        this.createSelect(settingsSection, 'mode-sel', 'Mode', [
            { value: 'grayscale', label: 'Grayscale' },
            { value: 'dither', label: 'Dither (Bayer)' },
            { value: 'binary', label: 'Binary' },
            { value: 'block', label: 'Block (2x1)' }
        ], this.processor.options.mode, (v) => {
            this.processor.options.mode = v;
            this.processIfReady();
        });

        // Color Mode
        this.createSelect(settingsSection, 'color-sel', 'Color', [
            { value: 'color', label: 'Full Color' },
            { value: 'mono', label: 'Monochrome' }
        ], this.processor.options.colorMode, (v) => {
            this.processor.options.colorMode = v;
            this.processIfReady();
        });

        // Resolution
        this.createSlider(settingsSection, 'res', 'Resolution', 20, 500,
            this.processor.options.resolution, 1, (v) => {
                this.processor.options.resolution = v;
                this.processIfReady();
            });

        // Char Size
        this.createSlider(settingsSection, 'size', 'Char Size', 4, 32,
            this.processor.options.charSize, 1, (v) => {
                this.processor.options.charSize = v;
                this.processIfReady();
            });

        container.appendChild(settingsSection);

        // Adjustments Section
        const adjustSection = document.createElement('div');
        adjustSection.className = 'control-group';
        adjustSection.innerHTML = '<h4>Adjustments</h4>';

        this.createSlider(adjustSection, 'contrast', 'Contrast', -100, 100,
            this.processor.options.contrast, 1, (v) => {
                this.processor.options.contrast = v;
                this.processIfReady();
            });

        this.createSlider(adjustSection, 'gamma', 'Gamma', 0.1, 3.0,
            this.processor.options.gamma, 0.1, (v) => {
                this.processor.options.gamma = v;
                this.processIfReady();
            });

        container.appendChild(adjustSection);

        // Export Section
        const exportSection = document.createElement('div');
        exportSection.className = 'control-group';
        exportSection.innerHTML = '<h4>Export</h4>';

        // Download PNG
        const downloadPngBtn = document.createElement('button');
        downloadPngBtn.textContent = '📥 Download as PNG';
        downloadPngBtn.className = 'primary';
        downloadPngBtn.onclick = () => this.downloadAsPng();
        downloadPngBtn.disabled = !this.hasSource;
        exportSection.appendChild(downloadPngBtn);

        // Download Base64 (.txt) - The "Wrong Way" comparison
        const downloadB64Btn = document.createElement('button');
        downloadB64Btn.textContent = '📄 Export as Base64 (.txt)';
        downloadB64Btn.style.marginTop = '8px';
        downloadB64Btn.style.fontSize = '11px';
        downloadB64Btn.style.opacity = '0.7';
        downloadB64Btn.onclick = () => this.downloadAsBase64();
        downloadB64Btn.disabled = !this.hasSource;
        exportSection.appendChild(downloadB64Btn);

        // Encode to ASCV
        const encodeBtn = document.createElement('button');
        encodeBtn.textContent = '💾 Encode to .ascv';
        encodeBtn.style.marginTop = '8px';
        encodeBtn.onclick = () => this.encodeImage();
        encodeBtn.disabled = !this.hasSource;
        exportSection.appendChild(encodeBtn);

        // Estimation display
        const estDiv = document.createElement('div');
        estDiv.id = 'est-display';
        estDiv.style.marginTop = '10px';
        estDiv.style.fontSize = '11px';
        estDiv.style.color = '#888';
        estDiv.style.lineHeight = '1.6';
        estDiv.innerHTML = 'Est. Size: --';
        exportSection.appendChild(estDiv);
        this.updateEstimation();

        container.appendChild(exportSection);

        // Reset Section
        const resetSection = document.createElement('div');
        resetSection.className = 'control-group';

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄 Load New Image';
        resetBtn.onclick = () => this.reset();
        resetSection.appendChild(resetBtn);
        container.appendChild(resetSection);
    }

    createSlider(parent, id, label, min, max, val, step, onChange) {
        const div = document.createElement('div');
        div.className = 'control-item';
        div.innerHTML = `
            <label>${label} <span id="val-${id}">${val}</span></label>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" id="${id}">
        `;
        parent.appendChild(div);

        const input = div.querySelector('input');
        input.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            div.querySelector(`#val-${id}`).textContent = v;
            onChange(v);
        });
    }

    createSelect(parent, id, label, options, val, onChange) {
        const div = document.createElement('div');
        div.className = 'control-item';
        div.innerHTML = `<label>${label}</label>`;

        const sel = document.createElement('select');
        sel.id = id;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === val) o.selected = true;
            sel.appendChild(o);
        });
        div.appendChild(sel);
        parent.appendChild(div);

        sel.addEventListener('change', (e) => onChange(e.target.value));
    }

    processIfReady() {
        if (this.hasSource) {
            this.processor.process();
            this.updateEncoderStats();
            this.updateEstimation();
        }
    }

    async updateEstimation() {
        const estDiv = document.getElementById('est-display');
        if (!estDiv || !this.processor.currentFrameData) {
            if (estDiv) estDiv.innerHTML = 'Est. Size: --';
            return;
        }

        const frameData = this.processor.currentFrameData;
        const jsonStr = JSON.stringify({
            meta: { version: 2, frameCount: 1 },
            frames: [{ t: 0, d: frameData }]
        });
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const rawSize = blob.size;

        let gzipSize = 0;
        try {
            const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
            const compressedBlob = await new Response(stream).blob();
            gzipSize = compressedBlob.size;
        } catch (e) {
            console.warn('GZIP calculation failed', e);
            gzipSize = Math.round(rawSize * 0.3); // Fallback
        }

        const format = (b) => {
            if (b < 1024) return b + ' B';
            if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
            return (b / 1024 / 1024).toFixed(2) + ' MB';
        };
        estDiv.innerHTML = `
            <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; border-left: 3px solid var(--accent-primary);">
                <strong>Efficiency Comparison:</strong><br>
                🚫 Base64: <span style="color: #ff4d4d">${format(rawSize * 1.33)} (+33%)</span><br>
                📄 Raw JSON: <span style="color: #ffa500">${format(rawSize)}</span><br>
                📦 <strong>.ASCV GZIP: <span style="color: #00ff88">${format(gzipSize)} (-${Math.round((1 - gzipSize / rawSize) * 100)}%)</span></strong>
            </div>
        `;
    }

    downloadAsPng() {
        if (!this.hasSource) return;

        const canvas = this.encoderCanvas;
        const link = document.createElement('a');
        link.download = `ascii-image-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.elements.statusBar.textContent = 'PNG downloaded!';
    }

    downloadAsBase64() {
        if (!this.hasSource) return;
        const frameData = this.processor.getFrameData();
        const jsonStr = JSON.stringify(frameData);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const blob = new Blob([b64], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ascii-base64-${Date.now()}.txt`;
        a.click();
        this.elements.statusBar.textContent = 'Base64 exported! (Check that file size...)';
    }

    downloadDecodedAsPng() {
        if (!this.hasDecodedData) return;

        const canvas = this.decoderCanvas;
        const link = document.createElement('a');
        link.download = `ascii-decoded-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.elements.statusBar.textContent = 'PNG downloaded!';
    }

    async encodeImage() {
        if (!this.hasSource) return;

        this.elements.statusBar.textContent = 'Encoding...';
        this.processor.process();
        this.encoder.start();
        this.encoder.addFrame(this.processor.currentFrameData, 0);

        const blob = await this.encoder.stopAndSave();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ascii-image-${Date.now()}.ascv.gz`;
        a.click();

        this.elements.statusBar.textContent = 'Image encoded and saved!';
    }

    reset() {
        this.processor.source = null;
        this.hasSource = false;
        this.hasDecodedData = false;
        this.decoder.pause();
        this.decoder.data = null;

        this.elements.dropZone.style.display = 'flex';
        this.elements.sourceImage.hidden = true;
        this.elements.statusBar.textContent = 'Ready';

        // Clear canvases
        const ctx1 = this.encoderCanvas.getContext('2d');
        ctx1.fillStyle = '#000';
        ctx1.fillRect(0, 0, this.encoderCanvas.width, this.encoderCanvas.height);

        this.decoderCtx.fillStyle = '#000';
        this.decoderCtx.fillRect(0, 0, this.decoderCanvas.width, this.decoderCanvas.height);

        this.renderControls();
    }
}

// Initialize
const app = new ImageApp();
app.init();
