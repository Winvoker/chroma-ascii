# 📦 ASCII Architect Core Usage Guide

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
