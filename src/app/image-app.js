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
            clickableSource: document.getElementById('clickable-source'),
            fileInput: document.getElementById('file-input'),
            sourceImage: document.getElementById('source-image'),
            asciiContainer: document.getElementById('ascii-container'),
            asciiCanvas: document.getElementById('ascii-canvas'),
            asciiCanvas: document.getElementById('ascii-canvas'),
            tabsArea: document.getElementById('tabs-area'),
            settingsArea: document.getElementById('settings-area'),
            adjustArea: document.getElementById('adjust-area'),
            exportArea: document.getElementById('export-area'),
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
        const { dropZone, fileInput, clickableSource } = this.elements;

        dropZone.addEventListener('click', () => fileInput.click());
        clickableSource.addEventListener('click', (e) => {
            // Only trigger if we are clicking the image/video area, not controls if any
            fileInput.click();
        });

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
        this.inputFileSize = file.size; // Store original size

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
        const { tabsArea, settingsArea, adjustArea, exportArea } = this.elements;
        if (!tabsArea || !settingsArea || !adjustArea || !exportArea) return;

        tabsArea.innerHTML = '';
        settingsArea.innerHTML = '';
        adjustArea.innerHTML = '';
        exportArea.innerHTML = '';

        // --- Column 1: Tabs ---

        // Mode Toggle Tabs
        const tabContainer = document.createElement('div');
        tabContainer.className = 'tab-container';
        tabContainer.style.marginBottom = 'var(--spacing-md)';

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
        tabsArea.appendChild(tabContainer);

        if (this.currentMode === 'decoder') {
            this.renderDecoderControls(settingsArea, exportArea);
        } else {
            this.renderEncoderControls(settingsArea, adjustArea, exportArea);
        }
    }

    renderDecoderControls(settingsArea, exportArea) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'control-group';
        infoDiv.innerHTML = `
            <h4>Playback</h4>
            <p style="color: #888; font-size: 11px; margin: 8px 0;">Viewing ascv art.</p>
        `;
        settingsArea.appendChild(infoDiv);

        if (this.hasDecodedData) {
            const expDiv = document.createElement('div');
            expDiv.className = 'control-group';
            expDiv.innerHTML = '<h4>Export</h4>';

            const downloadPngBtn = document.createElement('button');
            downloadPngBtn.textContent = '📥 Save as PNG';
            downloadPngBtn.className = 'primary';
            downloadPngBtn.onclick = () => this.downloadDecodedAsPng();
            expDiv.appendChild(downloadPngBtn);
            exportArea.appendChild(expDiv);
        }
    }

    renderEncoderControls(settingsArea, adjustArea, exportArea) {
        // --- General Settings (Col 1) ---
        const settingsSection = document.createElement('div');
        settingsSection.className = 'control-group';
        settingsSection.innerHTML = '<h4>General</h4>';

        const isMono = this.processor.options.colorMode === 'mono' || this.processor.options.colorMode === 'rainbow';

        this.createButtonGroup(settingsSection, 'mode-grp', 'Process Mode', [
            { value: 'grayscale', label: 'Gray' },
            { value: 'dither', label: 'Dith' },
            { value: 'binary', label: 'Bin' },
            { value: 'block', label: 'Blok' }
        ], this.processor.options.mode, (v) => { this.processor.options.mode = v; this.processIfReady(); this.renderControls(); });

        this.createButtonGroup(settingsSection, 'color-grp', 'Color Palette', [
            { value: 'color', label: 'Color' },
            { value: 'mono', label: 'Mono' },
            { value: 'rainbow', label: 'Rain' }
        ], this.processor.options.colorMode, (v) => {
            this.processor.options.colorMode = v;
            this.processIfReady();
            this.renderControls();
        });

        this.createButtonGroup(settingsSection, 'depth-grp', 'Bit Depth', [
            { value: '4', label: '4-bit' },
            { value: '8', label: '8-bit' },
            { value: '12', label: '12-bit' }
        ], this.processor.options.colorDepth.toString(), (v) => { this.processor.options.colorDepth = parseInt(v); this.processIfReady(); }, isMono);

        if (this.processor.options.mode === 'binary' || this.processor.options.mode === 'dither') {
            this.createSlider(settingsSection, 'threshold', 'Binary Thresh', 0, 255, this.processor.options.binaryThreshold, 1, (v) => { this.processor.options.binaryThreshold = v; this.processIfReady(); });
        }

        this.createSlider(settingsSection, 'res', 'Res', 20, 500, this.processor.options.resolution, 1, (v) => { this.processor.options.resolution = v; this.processIfReady(); });
        this.createSlider(settingsSection, 'size', 'Size', 4, 32, this.processor.options.charSize, 1, (v) => { this.processor.options.charSize = v; this.processIfReady(); });

        settingsArea.appendChild(settingsSection);

        // --- Adjust (Col 2 Bottom) ---
        const adjustSection = document.createElement('div');
        adjustSection.className = 'control-group';
        adjustSection.innerHTML = '<h4>Adjust</h4>';

        this.createSlider(adjustSection, 'contrast', 'Contrast', -100, 100, this.processor.options.contrast, 1, (v) => { this.processor.options.contrast = v; this.processIfReady(); });
        this.createSlider(adjustSection, 'brightness', 'Bright', -100, 100, this.processor.options.brightness, 1, (v) => { this.processor.options.brightness = v; this.processIfReady(); });
        this.createSlider(adjustSection, 'exposure', 'Exp', 0.1, 5.0, this.processor.options.exposure, 0.1, (v) => { this.processor.options.exposure = v; this.processIfReady(); });
        this.createSlider(adjustSection, 'gamma', 'Gamma', 0.1, 10.0, this.processor.options.gamma, 0.1, (v) => { this.processor.options.gamma = v; this.processIfReady(); });
        this.createCheckbox(adjustSection, 'inverted', 'Invert', this.processor.options.inverted, (v) => { this.processor.options.inverted = v; this.processIfReady(); });

        adjustArea.appendChild(adjustSection);

        // --- Export (Col 1 Bottom) ---
        const exportSection = document.createElement('div');
        exportSection.className = 'control-group';
        exportSection.innerHTML = '<h4>Export</h4>';

        const downloadPngBtn = document.createElement('button');
        downloadPngBtn.textContent = '📥 Save PNG';
        downloadPngBtn.className = 'primary';
        downloadPngBtn.onclick = () => this.downloadAsPng();
        downloadPngBtn.disabled = !this.hasSource;
        exportSection.appendChild(downloadPngBtn);

        const encodeBtn = document.createElement('button');
        encodeBtn.textContent = '💾 Save .ascv';
        encodeBtn.style.marginTop = '8px';
        encodeBtn.onclick = () => this.encodeImage();
        encodeBtn.disabled = !this.hasSource;
        exportSection.appendChild(encodeBtn);

        // Est inside export
        const estDiv = document.createElement('div');
        estDiv.id = 'est-display-js';
        estDiv.className = 'estimation-box';
        estDiv.innerHTML = 'Est. Size: --';
        exportSection.appendChild(estDiv);

        exportArea.appendChild(exportSection);
        this.updateEstimation();
    }

    createButtonGroup(parent, id, label, options, currentVal, onChange, disabled = false) {
        const div = document.createElement('div');
        div.className = 'control-item';
        div.innerHTML = `<label>${label}</label>`;

        const group = document.createElement('div');
        group.className = 'button-group';
        if (disabled) group.style.opacity = '0.5';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = `group-btn ${opt.value === currentVal ? 'active' : ''}`;
            btn.textContent = opt.label;
            btn.disabled = disabled;
            btn.onclick = () => {
                if (btn.classList.contains('active')) return;
                group.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onChange(opt.value);
            };
            group.appendChild(btn);
        });

        div.appendChild(group);
        parent.appendChild(div);
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

    createCheckbox(parent, id, label, val, onChange) {
        const div = document.createElement('div');
        div.className = 'control-item checkbox-item';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        div.style.cursor = 'pointer';
        div.style.marginTop = '10px';
        div.innerHTML = `
            <input type="checkbox" id="${id}" ${val ? 'checked' : ''} style="cursor: pointer; width: 18px; height: 18px; accent-color: var(--accent-primary);">
            <label for="${id}" style="cursor: pointer; margin: 0;">${label}</label>
        `;
        parent.appendChild(div);

        const input = div.querySelector('input');
        input.addEventListener('change', (e) => {
            onChange(e.target.checked);
        });
    }

    createSelect(parent, id, label, options, val, onChange, disabled = false) {
        const div = document.createElement('div');
        div.className = 'control-item';
        div.innerHTML = `<label>${label}</label>`;

        const sel = document.createElement('select');
        sel.id = id;
        sel.disabled = disabled;
        if (disabled) sel.style.opacity = '0.5';
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
        const { estDisplay } = this.elements;
        if (!estDisplay) return;

        const data = this.processor.currentFrameData;
        const inputSize = this.inputFileSize || 0;

        const formatSize = (bytes) => {
            if (!bytes || bytes <= 0) return 'n/a';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };

        let ascvSize = 0;
        let jsonSize = 0;
        let gzSize = 0;
        let b64Size = 0;

        if (data) {
            const json = JSON.stringify({
                meta: { version: 4, frameCount: 1 },
                frames: [{ t: 0, d: data }]
            });
            jsonSize = json.length;
            b64Size = btoa(unescape(encodeURIComponent(json))).length;

            // ASCV estimate (charIndices + selective colors + metadata)
            ascvSize = data.charIndices ? data.charIndices.length : 0;
            if (data.colors) ascvSize += data.colors.length * 2;
            ascvSize += 100; // Metadata overhead

            gzSize = Math.floor(ascvSize * 0.4); // Rough GZIP for .ascv.gz
        }

        estDisplay.innerHTML = `
            <table>
                <tr class="header-row">
                    <td>Efficiency</td>
                    <td>Size</td>
                </tr>
                <tr>
                    <td>Original</td>
                    <td>${formatSize(inputSize)}</td>
                </tr>
                <tr>
                    <td>.ascv (Custom)</td>
                    <td>${formatSize(gzSize)}</td>
                </tr>
                <tr>
                    <td>JSON (Raw)</td>
                    <td>${formatSize(jsonSize)}</td>
                </tr>
                <tr>
                    <td>GZIP (Comp.)</td>
                    <td>${formatSize(Math.floor(jsonSize * 0.4))}</td>
                </tr>
                <tr>
                    <td>Base64 (Text)</td>
                    <td>${formatSize(b64Size)}</td>
                </tr>
            </table>
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
