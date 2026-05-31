# 📦 ChromaASCII Core Usage Guide

This guide explains how to use the core ASCII processing motor in other projects. The core logic is designed to be framework-agnostic and modular.

## 📂 Core Files
To use the engine, you need the following files from `src/`:
- `core/AsciiProcessor.js`: The main processing engine.
- `core/VideoEncoder.js`: Handles frame collection and Gzip compression.
- `core/VideoDecoder.js`: Handles Gzip decompression and frame-based playback.
- `utils/BayerMatrix.js`: Required for dithered rendering modes.

---

## 🎨 1. Encoding (Image/Video to ASCII)

The `AsciiProcessor` converts visual sources (Images, Videos, Canvases) into a structured data object containing characters and colors.

```javascript
import { AsciiProcessor } from './core/AsciiProcessor.js';
import { VideoEncoder } from './core/VideoEncoder.js';

const processor = new AsciiProcessor();
const encoder = new VideoEncoder();

// 1. Configure Options
processor.options.resolution = 150;     // Width in characters
processor.options.colorMode = 'color';  // 'color' or 'mono'
processor.options.mode = 'grayscale';   // 'grayscale', 'dither', 'binary', 'block'

// 2. Set Source (HTMLImageElement or HTMLVideoElement)
processor.setSource(imgElement);

// 3. Process Frame
processor.process(); 
const frameData = processor.currentFrameData; 
/* frameData: { 
    text: string, 
    colors: Int32Array, 
    width: number, 
    height: number, 
    charSize: number 
} */

// 4. Save as .ascv.gz
encoder.start();
encoder.addFrame(frameData, 0); // (data, timestamp_ms)
const compressedBlob = await encoder.stopAndSave();
```

---

## 📖 2. Decoding (Playback ASCII)

The `VideoDecoder` handles the timing and data management for playback, while `AsciiProcessor.drawFrame` handles the actual rendering to a Canvas.

```javascript
import { VideoDecoder } from './core/VideoDecoder.js';
import { AsciiProcessor } from './core/AsciiProcessor.js';

const decoder = new VideoDecoder();
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');

// 1. Load the compressed file
await decoder.load(fileBlob);

// 2. Start Playback
decoder.play((frame) => {
    // This static method handles the drawing logic efficiently
    AsciiProcessor.drawFrame(ctx, frame);
}, () => {
    console.log("Playback finished");
});
```

---

## 📜 3. The .ascv File Protocol
The `.ascv` format is a Gzipped JSON structure. You can un-gzip it to see the raw data:

```json
{
  "meta": {
    "version": 2,          // Support for RGB color array
    "frameCount": 1,
    "date": "ISO-STRING"
  },
  "frames": [
    {
      "t": 0,              // Timestamp in milliseconds
      "d": {
        "text": "...",     // ASCII string with \n
        "colors": [],      // Array of 32-bit packed integers (0xRRGGBB)
        "width": 100,      // Grid width
        "height": 50,      // Grid height
        "charSize": 10,    // Recommended font size
        "mode": "grayscale"
      }
    }
  ]
}
```

---

## 🛠️ Performance Tips
- **Color Packing:** Colors are stored as `Int32Array` for better memory efficiency and faster compression.
- **Block Mode:** The `block` mode uses special characters (▀, ▄, █) to double the vertical resolution.
- **Static Drawing:** `AsciiProcessor.drawFrame` is a "pure" function. It doesn't require an instance and can be used to render frames on any canvas, even on multiple canvases simultaneously.

---

## ⚡ Browser library quickstart

This section focuses on using the core engine as a **browser library**, without relying on the built-in image/video UIs.

### 1. Display a pre-generated ASCII frame

Assume you already have a `frameData` object that matches what `AsciiProcessor.process()` produces (for example, loaded from JSON or decoded from an `.ascv` file).

```javascript
import { AsciiProcessor } from './src/core/AsciiProcessor.js';

// 1. Get or load frameData (e.g. from fetch() or file input)
// const frameData = JSON.parse(textFromServerOrFile);

// 2. Prepare a canvas
const canvas = document.getElementById('asciiCanvas');
const ctx = canvas.getContext('2d');

// 3. Draw once
AsciiProcessor.drawFrame(ctx, frameData);
```

Notes:
- `frameData` should at minimum include `width`, `height`, `charSize`, `text` (with `\n`), and a color representation compatible with the current `.ascv` / engine format.
- You can call `AsciiProcessor.drawFrame` repeatedly (e.g. in `requestAnimationFrame`) if you have a sequence of frames.

### 2. Generate ASCII from an image or video and save it

#### 2.1 Single image → ASCII + PNG or `.ascv.gz`

```javascript
import { AsciiProcessor } from './src/core/AsciiProcessor.js';
import { VideoEncoder } from './src/core/VideoEncoder.js';

const processor = new AsciiProcessor();
const encoder = new VideoEncoder();

// 1. Configure options
processor.options.resolution = 150;
processor.options.colorMode = 'color';
processor.options.mode = 'grayscale';

// 2. Set the source (an HTMLImageElement that has finished loading)
processor.setSource(imageElement);

// 3. Optionally set a render canvas for preview
processor.setRenderCanvas(previewCanvas);

// 4. Process once
processor.process();
const frameData = processor.currentFrameData;

// 5a. Save as PNG using the preview canvas
previewCanvas.toBlob((blob) => {
  // e.g. create a download link or upload the blob
});

// 5b. Or save as .ascv.gz using VideoEncoder (single frame)
encoder.start();
encoder.addFrame(frameData, 0);
const ascvBlob = await encoder.stopAndSave(); // write as .ascv.gz
```

#### 2.2 Video/GIF → `.ascv.gz` and playback

High-level flow:

1. Set an `HTMLVideoElement` (or a GIF-backed canvas) as the source for `AsciiProcessor`.
2. On a timer or inside `requestAnimationFrame`, call `processor.process()` and pass `processor.currentFrameData` into `VideoEncoder.addFrame(frameData, timeMs)`.
3. When done, call `stopAndSave()` to get an `.ascv.gz` blob.
4. Later, load this blob with `VideoDecoder` and render each frame using `AsciiProcessor.drawFrame`.

```javascript
import { AsciiProcessor } from './src/core/AsciiProcessor.js';
import { VideoEncoder } from './src/core/VideoEncoder.js';
import { VideoDecoder } from './src/core/VideoDecoder.js';

// Encoding
const processor = new AsciiProcessor();
const encoder = new VideoEncoder();

processor.setSource(videoElement);
processor.setRenderCanvas(previewCanvas);

encoder.start();

let startTime = performance.now();

function captureFrame() {
  const now = performance.now();
  const t = now - startTime;

  processor.process();
  encoder.addFrame(processor.currentFrameData, t);

  if (!videoElement.ended) {
    requestAnimationFrame(captureFrame);
  }
}

requestAnimationFrame(captureFrame);

// later, after capture finishes:
const ascvBlob = await encoder.stopAndSave(); // .ascv.gz

// Decoding and playback
const decoder = new VideoDecoder();
await decoder.load(ascvBlob);

const outputCanvas = document.getElementById('playbackCanvas');
const outputCtx = outputCanvas.getContext('2d');

decoder.play((frame) => {
  AsciiProcessor.drawFrame(outputCtx, frame);
}, () => {
  console.log('Playback finished');
});
```

This pattern lets you:
- Use the engine as a **drop-in browser library** to show pre-generated ASCII frames.
- Encode new ASCII content from images or videos and save it as PNG or `.ascv.gz` for later playback.
