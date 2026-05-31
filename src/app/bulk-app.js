import { AsciiProcessor } from '../core/AsciiProcessor.js';

class BulkApp {
    constructor() {
        this.processor = new AsciiProcessor();
        this.files = [];
        this.results = [];
        this.processing = false;

        this.stats = {
            images: 0,
            processed: 0,
            failed: 0
        };

        this.elements = {
            dropZone: document.getElementById('drop-zone'),
            folderInput: document.getElementById('folder-input'),
            processBtn: document.getElementById('process-btn'),
            downloadBtn: document.getElementById('download-btn'),
            statusBar: document.getElementById('status-bar'),
            progressBar: document.getElementById('progress-bar'),
            stats: document.getElementById('stats'),
            log: document.getElementById('log'),
            resolution: document.getElementById('resolution'),
            charSize: document.getElementById('charSize'),
            colorDepth: document.getElementById('colorDepth'),
            statImages: document.getElementById('stat-images'),
            statProcessed: document.getElementById('stat-processed'),
            statFailed: document.getElementById('stat-failed')
        };

        this.init();
    }

    init() {
        const { dropZone, folderInput, processBtn, downloadBtn } = this.elements;

        dropZone.addEventListener('click', () => folderInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragging');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragging');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragging');
            this.handleFolderSelect(e.dataTransfer.files);
        });

        folderInput.addEventListener('change', (e) => {
            this.handleFolderSelect(e.target.files);
            e.target.value = '';
        });

        processBtn.addEventListener('click', () => this.processAll());
        downloadBtn.addEventListener('click', () => this.downloadZip());
    }

    handleFolderSelect(fileList) {
        if (!fileList || fileList.length === 0) return;

        this.files = Array.from(fileList).filter(f => {
            const name = f.name.toLowerCase();
            return /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(name);
        });

        if (this.files.length === 0) {
            this.log('No image files found.', 'error');
            return;
        }

        this.stats.images = this.files.length;
        this.stats.processed = 0;
        this.stats.failed = 0;

        this.updateStats();
        this.log(`Loaded ${this.files.length} images.`);
        this.elements.processBtn.disabled = false;
        this.elements.downloadBtn.disabled = true;
    }

    updateStats() {
        const { stats, statImages, statProcessed, statFailed } = this.elements;
        stats.style.display = 'grid';
        statImages.textContent = this.stats.images;
        statProcessed.textContent = this.stats.processed;
        statFailed.textContent = this.stats.failed;
    }

    log(msg, type = '') {
        const { log } = this.elements;
        const item = document.createElement('div');
        item.className = `log-item ${type}`;
        item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        log.insertBefore(item, log.firstChild);
    }

    updateProgress(percent) {
        this.elements.progressBar.style.width = `${percent}%`;
    }

    async processAll() {
        if (this.processing) return;
        this.processing = true;
        this.elements.processBtn.disabled = true;
        this.results = [];
        this.stats.processed = 0;
        this.stats.failed = 0;

        // Aligning exactly with image-app defaults
        this.processor.options.resolution = parseInt(this.elements.resolution.value) || 100;
        this.processor.options.charSize = parseInt(this.elements.charSize.value) || 10;
        this.processor.options.colorDepth = parseInt(this.elements.colorDepth.value) || 8;
        this.processor.options.mode = 'block';
        this.processor.options.colorMode = 'color';
        this.processor.options.autoLevel = true;
        
        // Reset adjustments to defaults (matching image-app initial state)
        this.processor.options.contrast = 0;
        this.processor.options.brightness = 0;
        this.processor.options.exposure = 1.0;
        this.processor.options.gamma = 1.0;
        this.processor.options.inverted = false;

        const total = this.files.length;
        this.log('Starting bulk processing...');

        for (let i = 0; i < total; i++) {
            const file = this.files[i];
            this.elements.statusBar.textContent = `Processing ${i + 1}/${total}: ${file.name}`;
            this.updateProgress(((i + 1) / total) * 100);

            try {
                const result = await this.processImage(file);
                this.results.push(result);
                this.stats.processed++;
                this.log(`✓ ${file.name} → ${result.filename}`, 'success');
            } catch (e) {
                this.stats.failed++;
                this.log(`✗ ${file.name}: ${e.message}`, 'error');
                console.error(e);
            }

            this.updateStats();
        }

        this.processing = false;
        this.elements.statusBar.textContent = `Done! ${this.stats.processed} processed, ${this.stats.failed} failed.`;
        this.elements.downloadBtn.disabled = this.results.length === 0;
        this.log('Batch complete!');
    }

    processImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                this.processor.setSource(img);
                this.processor.process();

                const frameData = this.processor.currentFrameData;
                if (!frameData) {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to process image'));
                    return;
                }

                const output = {
                    meta: { version: 4, frameCount: 1, type: 'image' },
                    frames: [{ t: 0, d: frameData }]
                };

                const blob = new Blob([JSON.stringify(output)], { type: 'application/json' });
                const baseName = file.name.replace(/\.[^.]+$/, '');
                const filename = `${baseName}.ascv`;

                URL.revokeObjectURL(url);
                resolve({ filename, data: blob });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }

    async downloadZip() {
        if (this.results.length === 0) return;

        this.elements.statusBar.textContent = 'Creating ZIP...';
        this.elements.downloadBtn.disabled = true;

        const zip = new JSZip();

        for (const result of this.results) {
            zip.file(result.filename, result.data);
        }

        const blob = await zip.generateAsync({ type: 'blob' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chromaascii-bulk-${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);

        this.elements.statusBar.textContent = 'ZIP downloaded!';
        this.elements.downloadBtn.disabled = false;
    }
}

new BulkApp();
