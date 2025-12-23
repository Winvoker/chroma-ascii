import { AsciiProcessor } from '../core/AsciiProcessor.js';
import { VideoEncoder } from '../core/VideoEncoder.js';
import { VideoDecoder } from '../core/VideoDecoder.js';

class VideoApp {
    constructor() {
        this.processor = new AsciiProcessor();
        this.encoder = new VideoEncoder();
        this.decoder = new VideoDecoder();
        this.currentMode = 'encoder'; // 'encoder' or 'decoder'
        this.hasSource = false;
        this.hasDecodedData = false;
        this.targetFps = 10;
        this.lastFrameTime = 0;
        this.estimationInterval = null;

        this.elements = {
            dropZone: document.getElementById('drop-zone'),
            clickableSource: document.getElementById('clickable-source'),
            fileInput: document.getElementById('file-input'),
            sourceVideo: document.getElementById('source-video'),
            asciiContainer: document.getElementById('ascii-container'),
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

        this.updateLoop = this.updateLoop.bind(this);
    }

    init() {
        this.setupDragAndDrop();
        this.renderControls();
        requestAnimationFrame(this.updateLoop);
        console.log('Video App initialized');
    }

    setupDragAndDrop() {
        const { dropZone, fileInput, clickableSource } = this.elements;

        dropZone.addEventListener('click', () => fileInput.click());
        clickableSource.addEventListener('click', (e) => {
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
        const { sourceVideo, dropZone } = this.elements;

        // Reset state - clear handlers FIRST to prevent false error triggers
        sourceVideo.onerror = null;
        sourceVideo.onloadedmetadata = null;
        if (sourceVideo.src) {
            sourceVideo.pause();
            sourceVideo.removeAttribute('src');
            sourceVideo.load(); // Reset the video element
        }
        sourceVideo.hidden = true;
        this.decoder.pause();
        this.processor.source = null;
        this.hasSource = false;
        this.hasDecodedData = false;
        this.inputFileSize = file.size;

        const isAscii = file.name.endsWith('.ascv') || file.name.endsWith('.gz') ||
            file.name.endsWith('.json') || file.type === 'application/json';
        const isVideo = file.type.startsWith('video/') ||
            ['.mp4', '.webm', '.ogg', '.mov'].some(ext =>
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
                    const type = meta.frameCount === 1 ? 'Image' : 'Video';
                    this.elements.statusBar.textContent = `Loaded ${type}: ${meta.frameCount} frames`;

                    // Start playback
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
        } else if (isVideo) {
            this.switchMode('encoder');
            dropZone.style.display = 'none';
            sourceVideo.src = url;
            sourceVideo.muted = true;
            sourceVideo.hidden = false;

            sourceVideo.onloadedmetadata = () => {
                this.processor.setSource(sourceVideo);
                this.hasSource = true;
                sourceVideo.play();
                this.elements.statusBar.textContent = `Source: ${file.name} (${Math.round(sourceVideo.duration)}s)`;
                this.renderControls();
            };

            sourceVideo.onerror = () => {
                alert('Error loading video');
                dropZone.style.display = 'flex';
                this.hasSource = false;
                this.renderControls();
            };
        } else {
            alert('Please use a video file or .ascv file');
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

    updateLoop(timestamp) {
        if (this.currentMode === 'encoder' && this.hasSource &&
            this.processor.isVideo && !this.encoder.isEncoding &&
            !this.elements.sourceVideo.paused) {

            // Throttle based on target FPS
            const frameInterval = 1000 / this.targetFps;
            if (timestamp - this.lastFrameTime >= frameInterval) {
                this.lastFrameTime = timestamp;
                this.processor.process();
                this.updateEncoderStats();

                // Only update estimation if it's been a while (e.g. 1 second)
                if (!this.lastEstimationTime || timestamp - this.lastEstimationTime > 1000) {
                    this.lastEstimationTime = timestamp;
                    this.updateEstimation();
                }
            }
        }
        requestAnimationFrame(this.updateLoop);
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

        // Tabs
        const tabContainer = document.createElement('div');
        tabContainer.className = 'tab-container';
        tabContainer.style.marginBottom = 'var(--spacing-md)';

        const btnEnc = document.createElement('button');
        btnEnc.textContent = '🎥 Encoder';
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
            <h4>Decoder</h4>
            <p style="color: #888; font-size: 11px; margin: 8px 0;">Playing .ascv stream.</p>
        `;
        settingsArea.appendChild(infoDiv);

        if (this.hasDecodedData) {
            // Playback controls
            const playbackSection = document.createElement('div');
            playbackSection.className = 'control-group';
            playbackSection.innerHTML = '<h4>Playback</h4>';

            const pauseBtn = document.createElement('button');
            pauseBtn.textContent = this.decoder.isPlaying ? '⏸️ Pause' : '▶️ Play';
            pauseBtn.onclick = () => {
                if (this.decoder.isPlaying) {
                    this.decoder.pause();
                } else {
                    this.decoder.play((frame) => {
                        AsciiProcessor.drawFrame(this.decoderCtx, frame);
                    }, () => { });
                }
                this.renderControls();
            };
            playbackSection.appendChild(pauseBtn);

            settingsArea.appendChild(playbackSection);

            const expSection = document.createElement('div');
            expSection.className = 'control-group';
            expSection.innerHTML = '<h4>Download</h4>';

            const downloadGifBtn = document.createElement('button');
            downloadGifBtn.textContent = '🎬 Download as GIF';
            downloadGifBtn.className = 'primary';
            downloadGifBtn.onclick = () => this.downloadDecodedAsGif(downloadGifBtn);
            expSection.appendChild(downloadGifBtn);

            const downloadPngBtn = document.createElement('button');
            downloadPngBtn.textContent = '📥 Save PNG';
            downloadPngBtn.style.marginTop = '8px';
            downloadPngBtn.onclick = () => this.downloadDecodedFrameAsPng();
            expSection.appendChild(downloadPngBtn);
            exportArea.appendChild(expSection);
        }
    }

    renderEncoderControls(settingsArea, adjustArea, exportArea) {
        // --- General Settings (Col 2) ---
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

        // --- Adjust (Col 2) ---
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

        this.createSlider(exportSection, 'target-fps', 'FPS', 1, 60, this.targetFps, 1, (v) => { this.targetFps = v; this.updateEstimation(); });

        const downloadPngBtn = document.createElement('button');
        downloadPngBtn.textContent = '📥 Save PNG';
        downloadPngBtn.className = 'primary';
        downloadPngBtn.onclick = () => this.downloadFrameAsPng();
        downloadPngBtn.disabled = !this.hasSource;
        exportSection.appendChild(downloadPngBtn);

        const encodeBtn = document.createElement('button');
        encodeBtn.textContent = '💾 Save as .ascv';
        encodeBtn.className = 'primary';
        encodeBtn.id = 'encode-btn';
        encodeBtn.style.marginTop = '8px';
        encodeBtn.onclick = () => this.encodeVideo(encodeBtn);
        encodeBtn.disabled = !this.hasSource;
        exportSection.appendChild(encodeBtn);

        // Est inside export
        const estDiv = document.createElement('div');
        estDiv.id = 'est-display-js';
        estDiv.className = 'estimation-box';
        estDiv.innerHTML = 'Est. Size: --';
        exportSection.appendChild(estDiv);

        exportArea.appendChild(exportSection);

        if (this.hasSource) {
            const pbSection = document.createElement('div');
            pbSection.className = 'control-group';
            pbSection.innerHTML = '<h4>Playback</h4>';
            const playPauseBtn = document.createElement('button');
            playPauseBtn.textContent = this.elements.sourceVideo.paused ? '▶ Play' : '⏸ Pause';
            playPauseBtn.onclick = () => {
                if (this.elements.sourceVideo.paused) this.elements.sourceVideo.play(); else this.elements.sourceVideo.pause();
                playPauseBtn.textContent = this.elements.sourceVideo.paused ? '▶ Play' : '⏸ Pause';
            };
            pbSection.appendChild(playPauseBtn);
            settingsArea.appendChild(pbSection);
        }

        this.updateEstimation();
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
        let rawTotal = 0;
        let estDelta = 0;
        let estGzip = 0;

        if (data) {
            const frameSize = JSON.stringify(data).length;
            const fps = this.targetFps || 30;
            const duration = this.elements.sourceVideo?.duration || 1;
            const frameCount = Math.floor(fps * duration);
            rawTotal = frameSize * frameCount;

            // Delta is usually 40% of Raw, and GZIP 15% of Delta for video
            estDelta = Math.round(rawTotal * 0.4);
            estGzip = Math.round(estDelta * 0.15);
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
                    <td>${formatSize(estGzip)}</td>
                </tr>
                <tr>
                    <td>JSON (Raw)</td>
                    <td>${formatSize(rawTotal)}</td>
                </tr>
                <tr>
                    <td>Delta (Enc.)</td>
                    <td>${formatSize(estDelta)}</td>
                </tr>
                <tr>
                    <td>GZIP (Comp.)</td>
                    <td>${formatSize(estGzip)}</td>
                </tr>
            </table>
        `;
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

    downloadFrameAsPng() {
        if (!this.hasSource) return;

        const canvas = this.encoderCanvas;
        const link = document.createElement('a');
        link.download = `ascii-frame-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.elements.statusBar.textContent = 'Frame PNG downloaded!';
    }

    downloadFrameAsBase64() {
        if (!this.hasSource) return;
        const frameData = this.processor.getFrameData();
        const jsonStr = JSON.stringify(frameData);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const blob = new Blob([b64], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ascii-frame-base64-${Date.now()}.txt`;
        a.click();
        this.elements.statusBar.textContent = 'Base64 exported!';
    }

    downloadDecodedFrameAsPng() {
        if (!this.hasDecodedData) return;

        const canvas = this.decoderCanvas;
        const link = document.createElement('a');
        link.download = `ascii-decoded-frame-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.elements.statusBar.textContent = 'Frame PNG downloaded!';
    }

    async downloadDecodedAsGif(btn) {
        if (!this.hasDecodedData || !this.decoder.data) return;
        if (typeof GIF === 'undefined') {
            alert('GIF library loading. Please try again in a moment.');
            return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        this.elements.statusBar.textContent = 'Generating GIF...';

        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: this.decoderCanvas.width,
            height: this.decoderCanvas.height,
            workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
        });

        const frames = this.decoder.data.frames;
        this.decoder.pause();

        // Temporary canvas for rendering frames for the GIF
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.decoderCanvas.width;
        tempCanvas.height = this.decoderCanvas.height;
        const tempCtx = tempCanvas.getContext('2d', { alpha: false });

        let reconstructed = null;

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const nextFrame = frames[i + 1];
            const delay = nextFrame ? (nextFrame.t - frame.t) : 100;

            // Simple reconstruction logic (matches VideoDecoder)
            if (frame.type === 'f' || !frame.type) {
                reconstructed = JSON.parse(JSON.stringify(frame.d));
            } else if (frame.type === 'd' && reconstructed) {
                if (frame.cd) {
                    for (let j = 0; j < frame.cd.length; j += 2) {
                        reconstructed.colors[frame.cd[j]] = frame.cd[j + 1];
                    }
                }
                if (frame.td) {
                    const textChars = Array.from(reconstructed.text);
                    for (let j = 0; j < frame.td.length; j += 2) {
                        textChars[frame.td[j]] = frame.td[j + 1];
                    }
                    reconstructed.text = textChars.join('');
                }
            }

            if (reconstructed) {
                AsciiProcessor.drawFrame(tempCtx, reconstructed);
                gif.addFrame(tempCtx, { copy: true, delay: delay });
            }

            if (i % 10 === 0) {
                btn.textContent = `Frames: ${i}/${frames.length}`;
            }
        }

        gif.on('progress', (p) => {
            btn.textContent = `Rendering: ${Math.round(p * 100)}%`;
        });

        gif.on('finished', (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ascii-art-${Date.now()}.gif`;
            link.click();

            btn.disabled = false;
            btn.textContent = originalText;
            this.elements.statusBar.textContent = 'GIF downloaded!';
        });

        this.elements.statusBar.textContent = 'Rendering GIF...';
        gif.render();
    }

    async encodeVideo(encodeBtn) {
        if (!this.hasSource) return;

        const video = this.elements.sourceVideo;
        const fps = this.targetFps;

        encodeBtn.disabled = true;
        encodeBtn.textContent = 'Encoding...';
        this.decoder.pause();
        video.pause();

        const duration = video.duration;
        const originalTime = video.currentTime;
        const frameCount = Math.floor(duration * fps);
        const step = 1 / fps;

        this.encoder.start();
        this.elements.statusBar.textContent = 'Starting encoding...';

        let currentFrame = 0;
        video.currentTime = 0;

        const handler = () => {
            if (!this.encoder.isEncoding) {
                video.removeEventListener('seeked', handler);
                return;
            }

            this.processor.process();
            this.encoder.addFrame(this.processor.currentFrameData, video.currentTime * 1000);

            currentFrame++;
            const pct = Math.round((currentFrame / frameCount) * 100);
            encodeBtn.textContent = `Encoding ${pct}%`;
            this.elements.statusBar.textContent = `Encoding frame ${currentFrame}/${frameCount}`;

            if (currentFrame < frameCount) {
                video.currentTime = currentFrame * step;
            } else {
                video.removeEventListener('seeked', handler);
                (async () => {
                    this.elements.statusBar.textContent = 'Compressing...';
                    const blob = await this.encoder.stopAndSave();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ascii-video-${Date.now()}.ascv.gz`;
                    a.click();
                    encodeBtn.disabled = false;
                    encodeBtn.textContent = '💾 Encode Video to .ascv';
                    this.elements.statusBar.textContent = 'Done!';
                    video.currentTime = originalTime;
                })();
            }
        };

        video.removeEventListener('seeked', handler);
        video.addEventListener('seeked', handler);
        video.currentTime = 0;
    }

    reset() {
        this.processor.source = null;
        this.hasSource = false;
        this.hasDecodedData = false;
        this.decoder.pause();
        this.decoder.data = null;

        this.elements.dropZone.style.display = 'flex';
        this.elements.sourceVideo.pause();
        this.elements.sourceVideo.src = '';
        this.elements.sourceVideo.hidden = true;
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
const app = new VideoApp();
app.init();
