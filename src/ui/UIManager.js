import { VideoEncoder } from '../core/VideoEncoder.js';
import { VideoDecoder } from '../core/VideoDecoder.js';
import { Compression } from '../utils/Compression.js';
import { AsciiProcessor } from '../core/AsciiProcessor.js';

export class UIManager {
    constructor(processor) {
        this.processor = processor;
        this.encoder = new VideoEncoder();
        this.decoder = new VideoDecoder();
        this.currentTab = 'encoder';

        this.elements = {
            app: document.getElementById('app'),
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('file-input'),
            sourceVideo: document.getElementById('source-video'),
            sourceImage: document.getElementById('source-image'),
            asciiContainer: document.getElementById('ascii-container'),
            controlsContainer: document.getElementById('controls-container'),
            outputStats: document.getElementById('output-stats'),
            statusBar: document.getElementById('status-bar')
        };

        // Encoders Canvas
        this.encoderCanvas = document.createElement('canvas');
        this.encoderCanvas.id = 'encoder-canvas';
        this.processor.setRenderCanvas(this.encoderCanvas);

        // Decoder Canvas
        this.decoderCanvas = document.createElement('canvas');
        this.decoderCanvas.id = 'decoder-canvas';
        this.decoderCtx = this.decoderCanvas.getContext('2d', { alpha: false });

        this.handleResize = this.handleResize.bind(this);
    }

    init() {
        this.setupDragAndDrop();
        this.renderTabs();
        this.renderControls();

        this.elements.asciiContainer.innerHTML = '';
        this.elements.asciiContainer.appendChild(this.encoderCanvas); // Start in encoder mode

        window.addEventListener('beforeunload', () => {
            if (this.processor.source && this.processor.source.pause) this.processor.source.pause();
        });

        requestAnimationFrame(() => this.updateLoop());
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
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.add('dragging');
        });
        document.addEventListener('dragleave', (e) => {
            e.preventDefault(); e.stopPropagation();
            // Only remove if we're leaving the document or a specific area
            if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
                dropZone.classList.remove('dragging');
            }
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.remove('dragging');
            const file = e.dataTransfer.files[0];
            if (file) this.loadFile(file);
        });
    }

    loadFile(file) {
        const url = URL.createObjectURL(file);
        const { sourceVideo, sourceImage, dropZone } = this.elements;

        if (sourceVideo.src) { sourceVideo.pause(); sourceVideo.src = ''; }
        sourceVideo.hidden = true;
        sourceImage.hidden = true;
        this.decoder.pause();
        this.processor.source = null;

        const isAscii = file.name.endsWith('.ascv') || file.name.endsWith('.gz') || file.name.endsWith('.json') || file.type === 'application/json';
        const isVideo = file.type.startsWith('video/') || ['.mp4', '.webm', '.ogg', '.mov'].some(ext => file.name.toLowerCase().endsWith(ext));
        const isImage = file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].some(ext => file.name.toLowerCase().endsWith(ext));

        if (isAscii) {
            this.switchTab('decoder');
            dropZone.style.display = 'none';
            this.elements.statusBar.textContent = 'Loading...';

            const handleError = (e) => {
                console.error(e);
                alert('Load failed: ' + e.message);
                dropZone.style.display = 'flex';
                this.elements.statusBar.textContent = 'Ready';
            };

            const loadData = (blob) => {
                this.decoder.load(blob).then(meta => {
                    const type = meta.frameCount === 1 ? 'Image' : 'Video';
                    this.elements.statusBar.textContent = `Loaded ${type}: ${meta.frameCount} frames`;
                    if (meta.frameCount === 1) {
                        this.decoder.play((frame) => {
                            AsciiProcessor.drawFrame(this.decoderCtx, frame);
                        }, () => { });
                    } else {
                        this.startPlaybackLoop();
                    }
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
            this.switchTab('encoder');
            dropZone.style.display = 'none';
            sourceVideo.src = url;
            sourceVideo.muted = true;
            sourceVideo.onloadedmetadata = () => {
                this.processor.setSource(sourceVideo);
                sourceVideo.play();
                this.elements.statusBar.textContent = `Source: ${file.name} (${Math.round(sourceVideo.duration)}s)`;
            };
            sourceVideo.onerror = () => { alert('Error loading video'); dropZone.style.display = 'flex'; };
        } else if (isImage) {
            this.switchTab('encoder');
            dropZone.style.display = 'none';
            sourceImage.src = url;
            sourceImage.onload = () => {
                this.processor.setSource(sourceImage);
                this.processor.process();
                this.elements.statusBar.textContent = `Source: ${file.name}`;
            };
            sourceImage.onerror = () => { alert('Error loading image'); dropZone.style.display = 'flex'; };
        } else {
            // Fallback: Try loading as ASCII anyway if type is unknown
            this.elements.statusBar.textContent = 'Unknown type, trying as ASCII...';
            this.switchTab('decoder');
            dropZone.style.display = 'none';
            // Reuse loadData logic or just try loadData(file)
            this.decoder.load(file).then(meta => {
                this.elements.statusBar.textContent = `Loaded from unknown type: ${meta.frameCount} frames`;
                this.startPlaybackLoop();
            }).catch(() => {
                alert('Unsupported file format');
                dropZone.style.display = 'flex';
                this.elements.statusBar.textContent = 'Ready';
            });
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.renderControls();
        this.elements.asciiContainer.innerHTML = '';

        const { dropZone, sourceVideo, sourceImage } = this.elements;

        if (tab === 'encoder') {
            this.elements.asciiContainer.appendChild(this.encoderCanvas);
            if (!this.processor.source) {
                dropZone.style.display = 'flex';
            } else {
                dropZone.style.display = 'none';
            }
        } else {
            this.elements.asciiContainer.appendChild(this.decoderCanvas);
            if (!this.decoder.data) {
                dropZone.style.display = 'flex';
            } else {
                dropZone.style.display = 'none';
            }
        }
    }

    renderTabs() { }

    renderControls() {
        const container = this.elements.controlsContainer;
        container.innerHTML = '';

        const tabContainer = document.createElement('div');
        tabContainer.style.display = 'flex';
        tabContainer.style.marginBottom = '10px';
        tabContainer.style.gap = '5px';

        const btnEnc = document.createElement('button');
        btnEnc.textContent = 'Encoder';
        btnEnc.className = this.currentTab === 'encoder' ? 'primary' : '';
        btnEnc.onclick = () => this.switchTab('encoder');

        const btnDec = document.createElement('button');
        btnDec.textContent = 'Decoder';
        btnDec.className = this.currentTab === 'decoder' ? 'primary' : '';
        btnDec.onclick = () => this.switchTab('decoder');

        tabContainer.appendChild(btnEnc);
        tabContainer.appendChild(btnDec);
        container.appendChild(tabContainer);

        if (this.currentTab === 'decoder') {
            container.innerHTML += `<div style="padding:10px;color:#888;">
                <p>Drag & Drop .ascv or .ascv.gz files.</p>
                <button id="reset-dec" style="margin-top:10px">Reset / Load New</button>
             </div>`;
            setTimeout(() => {
                const b = document.getElementById('reset-dec');
                if (b) b.onclick = () => {
                    this.decoder.pause();
                    this.decoder.data = null;
                    this.elements.dropZone.style.display = 'flex';
                    // clear canvas
                    this.decoderCtx.fillStyle = '#111';
                    this.decoderCtx.fillRect(0, 0, this.decoderCanvas.width, this.decoderCanvas.height);
                };
            }, 0);
            return;
        }

        // --- ENCODER CONTROLS ---
        const createSlider = (id, label, min, max, val, step, onChange) => {
            const div = document.createElement('div');
            div.className = 'control-item';
            div.innerHTML = `<label>${label} <span id="val-${id}">${val}</span></label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" id="${id}">`;
            container.appendChild(div);

            const input = div.querySelector('input');
            input.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                div.querySelector(`#val-${id}`).textContent = v;
                onChange(v);
                if (!this.processor.isVideo) this.processor.process();
            });
        };

        const createSelect = (id, label, options, val, onChange) => {
            const div = document.createElement('div');
            div.className = 'control-item';
            div.innerHTML = `<label>${label}</label>`;
            const sel = document.createElement('select');
            sel.id = id;
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value; o.textContent = opt.label; if (opt.value === val) o.selected = true;
                sel.appendChild(o);
            });
            div.appendChild(sel);
            container.appendChild(div);
            sel.addEventListener('change', (e) => { onChange(e.target.value); if (!this.processor.isVideo) this.processor.process(); });
            sel.style.width = '100%'; sel.style.background = '#222'; sel.style.color = '#fff'; sel.style.border = '1px solid #444'; sel.style.padding = '4px';
        };

        const section = (title) => {
            const d = document.createElement('div');
            d.innerHTML = `<h4>${title}</h4>`;
            d.className = 'control-group';
            container.appendChild(d);
            return d;
        };

        const s1 = section('Settings');
        createSelect('mode-sel', 'Mode', [
            { value: 'grayscale', label: 'Grayscale' },
            { value: 'dither', label: 'Dither (Bayer)' },
            { value: 'binary', label: 'Binary' },
            { value: 'block', label: 'Block (2x1)' }
        ], this.processor.options.mode, (v) => this.processor.options.mode = v);

        // Color Mode (Fixed options or keep?)
        createSelect('color-sel', 'Color', [
            { value: 'color', label: 'Full Color' },
            { value: 'mono', label: 'Monochrome' }
        ], this.processor.options.colorMode, (v) => this.processor.options.colorMode = v);

        createSlider('res', 'Resolution', 20, 250, this.processor.options.resolution, 1, (v) => this.processor.options.resolution = v);
        createSlider('size', 'Char Size', 4, 32, this.processor.options.charSize, 1, (v) => this.processor.options.charSize = v);

        const s2 = section('Adjustments');
        createSlider('contrast', 'Contrast', -100, 100, this.processor.options.contrast, 1, (v) => this.processor.options.contrast = v);
        createSlider('gamma', 'Gamma', 0.1, 3.0, this.processor.options.gamma, 0.1, (v) => this.processor.options.gamma = v);

        const s3 = section('Export');
        const fpsDiv = document.createElement('div');
        fpsDiv.className = 'control-item';
        fpsDiv.innerHTML = `<label>Target FPS: <span id="target-fps-val">10</span></label><input type="range" min="1" max="60" value="10" id="target-fps">`;
        s3.appendChild(fpsDiv);
        const fpsInput = fpsDiv.querySelector('input');
        fpsInput.oninput = (e) => fpsDiv.querySelector('span').textContent = e.target.value;

        const encodeBtn = document.createElement('button');
        encodeBtn.textContent = this.processor.isVideo ? 'Encode Video' : (this.processor.source ? 'Encode Image' : 'Load Source');
        encodeBtn.className = 'primary';
        s3.appendChild(encodeBtn);

        const estDiv = document.createElement('div');
        estDiv.style.marginTop = '10px';
        estDiv.style.fontSize = '11px';
        estDiv.style.color = '#888';
        estDiv.innerHTML = 'Est. Size: --';
        s3.appendChild(estDiv);
        this.estDiv = estDiv;

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset / Load New';
        resetBtn.style.marginTop = '8px';
        resetBtn.onclick = () => {
            this.processor.source = null;
            this.elements.dropZone.style.display = 'flex';
            this.elements.sourceVideo.pause();
            this.elements.sourceVideo.src = '';
            this.elements.sourceVideo.hidden = true;
            this.elements.sourceImage.hidden = true;
            this.elements.statusBar.textContent = 'Ready';
            this.renderControls();
        };
        s3.appendChild(resetBtn);

        encodeBtn.onclick = async () => {
            if (encodeBtn.textContent === 'Load Source') {
                this.elements.fileInput.click();
                return;
            }

            if (this.processor.isVideo) {
                const fps = parseInt(fpsInput.value);
                const video = this.elements.sourceVideo;

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
                if (video.currentTime === 0 && duration > 0) { }

                const handler = () => {
                    if (!this.encoder.isEncoding) {
                        video.removeEventListener('seeked', handler);
                        return;
                    }
                    this.processor.process();
                    this.encoder.addFrame(this.processor.currentFrameData, video.currentTime * 1000); // Use full object

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
                            encodeBtn.textContent = 'Encode Video';
                            this.elements.statusBar.textContent = 'Done.';
                            video.currentTime = originalTime;
                        })();
                    }
                };
                video.removeEventListener('seeked', handler);
                video.addEventListener('seeked', handler);
                video.currentTime = 0;

            } else {
                encodeBtn.disabled = true;
                encodeBtn.textContent = 'Saving...';
                this.processor.process();
                this.encoder.start();
                this.encoder.addFrame(this.processor.currentFrameData, 0); // Use full object

                const blob = await this.encoder.stopAndSave();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ascii-image-${Date.now()}.ascv.gz`;
                a.click();

                encodeBtn.disabled = false;
                encodeBtn.textContent = 'Encode Image';
                this.elements.statusBar.textContent = 'Image saved.';
            }
        };

        if (this.estTimer) clearInterval(this.estTimer);
        this.estTimer = setInterval(() => {
            if (this.currentTab === 'encoder') {
                if (this.processor.currentFrameData) {
                    // Estimate based on JSON size of current frame obj
                    const frameSize = new Blob([JSON.stringify(this.processor.currentFrameData)]).size;
                    const fps = parseInt(document.getElementById('target-fps')?.value || 10);
                    const duration = this.processor.source?.duration || 1;
                    const isVideo = this.processor.isVideo;
                    const count = isVideo ? (fps * duration) : 1;
                    const estimatedTotal = frameSize * count;
                    const estGzip = Math.round(estimatedTotal * 0.4);

                    const format = (b) => {
                        if (b < 1024) return b + ' B';
                        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
                        return (b / 1024 / 1024).toFixed(1) + ' MB';
                    };
                    this.estDiv.innerHTML = `Frame: ${format(frameSize)}<br>Total (est): ${format(estimatedTotal)}<br>GZIP (est): ${format(estGzip)}`;
                } else {
                    this.estDiv.innerHTML = 'Est. Size: --';
                }
            }
        }, 1000);
    }

    startPlaybackLoop() {
        this.decoder.play((frame) => {
            if (frame && this.currentTab === 'decoder') {
                AsciiProcessor.drawFrame(this.decoderCtx, frame);
            }
        }, () => { });
    }

    updateLoop() {
        if (this.currentTab === 'encoder' && this.processor.isVideo && !this.encoder.isEncoding && !this.elements.sourceVideo.paused) {
            this.processor.process();
        }
        this.handleResize();
        requestAnimationFrame(() => this.updateLoop());
    }

    handleResize() { }
}
