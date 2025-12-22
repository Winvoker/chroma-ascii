import { AsciiProcessor } from './core/AsciiProcessor.js';
import { VideoEncoder } from './core/VideoEncoder.js';
import { VideoDecoder } from './core/VideoDecoder.js';

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
            fileInput: document.getElementById('file-input'),
            sourceVideo: document.getElementById('source-video'),
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

        this.updateLoop = this.updateLoop.bind(this);
    }

    init() {
        this.setupDragAndDrop();
        this.renderControls();
        requestAnimationFrame(this.updateLoop);
        console.log('Video App initialized');
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
                this.updateEstimationDisplay();
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
                Load .ascv or .ascv.gz files to view colored ASCII video.
            </p>
        `;
        container.appendChild(infoDiv);

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

            container.appendChild(playbackSection);

            // Download buttons section
            const exportSection = document.createElement('div');
            exportSection.className = 'control-group';
            exportSection.innerHTML = '<h4>Download</h4>';

            // Download as MP4/WebM video
            const downloadVideoBtn = document.createElement('button');
            downloadVideoBtn.textContent = '🎬 Download as Video (WebM)';
            downloadVideoBtn.className = 'primary';
            downloadVideoBtn.onclick = () => this.downloadDecodedAsVideo(downloadVideoBtn);
            exportSection.appendChild(downloadVideoBtn);

            // Download current frame as PNG
            const downloadPngBtn = document.createElement('button');
            downloadPngBtn.textContent = '📸 Download Frame as PNG';
            downloadPngBtn.style.marginTop = '8px';
            downloadPngBtn.onclick = () => this.downloadDecodedFrameAsPng();
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

        // Target FPS
        this.createSlider(exportSection, 'target-fps', 'Target FPS', 1, 60,
            this.targetFps, 1, (v) => {
                this.targetFps = v;
            });

        // Download current frame as PNG
        const downloadPngBtn = document.createElement('button');
        downloadPngBtn.textContent = '📥 Download Frame as PNG';
        downloadPngBtn.onclick = () => this.downloadFrameAsPng();
        downloadPngBtn.disabled = !this.hasSource;
        downloadPngBtn.style.marginTop = '10px';
        exportSection.appendChild(downloadPngBtn);

        // Encode to ASCV
        const encodeBtn = document.createElement('button');
        encodeBtn.textContent = '💾 Encode Video to .ascv';
        encodeBtn.className = 'primary';
        encodeBtn.style.marginTop = '8px';
        encodeBtn.id = 'encode-btn';
        encodeBtn.onclick = () => this.encodeVideo(encodeBtn);
        encodeBtn.disabled = !this.hasSource;
        exportSection.appendChild(encodeBtn);

        // Estimation display
        const estDiv = document.createElement('div');
        estDiv.id = 'est-display';
        estDiv.style.marginTop = '10px';
        estDiv.style.fontSize = '11px';
        estDiv.style.color = '#888';
        estDiv.innerHTML = 'Est. Size: --';
        exportSection.appendChild(estDiv);
        this.updateEstimation(estDiv);

        container.appendChild(exportSection);

        // Video Controls Section
        if (this.hasSource) {
            const videoSection = document.createElement('div');
            videoSection.className = 'control-group';
            videoSection.innerHTML = '<h4>Video Controls</h4>';

            const playPauseBtn = document.createElement('button');
            playPauseBtn.textContent = this.elements.sourceVideo.paused ? '▶️ Play' : '⏸️ Pause';
            playPauseBtn.onclick = () => {
                if (this.elements.sourceVideo.paused) {
                    this.elements.sourceVideo.play();
                } else {
                    this.elements.sourceVideo.pause();
                }
                this.renderControls();
            };
            videoSection.appendChild(playPauseBtn);

            container.appendChild(videoSection);
        }

        // Reset Section
        const resetSection = document.createElement('div');
        resetSection.className = 'control-group';

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄 Load New Video';
        resetBtn.onclick = () => this.reset();
        resetSection.appendChild(resetBtn);
        container.appendChild(resetSection);
    }

    processIfReady() {
        if (this.hasSource) {
            this.processor.process();
            this.updateEncoderStats();
            this.updateEstimationDisplay();
        }
    }

    updateEstimation() {
        // Initial call
        this.updateEstimationDisplay();
    }

    updateEstimationDisplay() {
        const estDiv = document.getElementById('est-display');
        if (!estDiv) return;

        if (this.currentMode === 'encoder' && this.processor.currentFrameData) {
            const frameSize = new Blob([JSON.stringify(this.processor.currentFrameData)]).size;
            const fps = this.targetFps;
            const duration = this.elements.sourceVideo?.duration || 1;
            const frameCount = Math.floor(fps * duration);
            const estimatedTotal = frameSize * frameCount;
            // Realistic GZIP for repeat data (colors/text) is often ~5-15% of raw JSON
            const estGzip = Math.round(estimatedTotal * 0.1);

            const format = (b) => {
                if (b < 1024) return b + ' B';
                if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
                return (b / 1024 / 1024).toFixed(2) + ' MB';
            };

            estDiv.innerHTML = `
                <strong>Estimated Size:</strong><br>
                Per Frame: ${format(frameSize)}<br>
                Frames: ${frameCount} @ ${fps}fps<br>
                Raw Total: ${format(estimatedTotal)}<br>
                GZIP (~10%): ${format(estGzip)}
            `;
        } else {
            estDiv.innerHTML = 'Est. Size: --';
        }
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

    downloadFrameAsPng() {
        if (!this.hasSource) return;

        const canvas = this.encoderCanvas;
        const link = document.createElement('a');
        link.download = `ascii-frame-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.elements.statusBar.textContent = 'Frame PNG downloaded!';
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

    async downloadDecodedAsVideo(btn) {
        if (!this.hasDecodedData || !this.decoder.data) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Recording...';
        this.elements.statusBar.textContent = 'Recording video...';

        // Get video duration from decoder data
        const duration = this.decoder.data.meta?.duration ||
            (this.decoder.data.frames[this.decoder.data.frames.length - 1]?.t || 3000);

        // Create a stream from the canvas
        const stream = this.decoderCanvas.captureStream(30); // 30 fps
        const chunks = [];

        // Try to use VP9 for better quality, fallback to VP8
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
        }

        const recorder = new MediaRecorder(stream, {
            mimeType: mimeType,
            videoBitsPerSecond: 5000000 // 5 Mbps
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ascii-video-${Date.now()}.webm`;
            link.click();
            URL.revokeObjectURL(url);

            btn.disabled = false;
            btn.textContent = originalText;
            this.elements.statusBar.textContent = 'Video downloaded!';
        };

        // Start recording
        recorder.start();

        // Ensure playback is running during recording
        this.decoder.pause();
        this.decoder.play((frame) => {
            if (frame) {
                AsciiProcessor.drawFrame(this.decoderCtx, frame);
            }
        }, () => { });

        // Stop after the video duration (plus a small buffer)
        setTimeout(() => {
            recorder.stop();
            this.decoder.pause();
        }, duration + 500);
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
