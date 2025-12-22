# 📟 ChromaASCII

![ChromaASCII Banner](assets/ascii-art-text.png)

> **Transform images and videos into vibrant, colored ASCII art with zero dependencies.**

![Preview](assets/image.png)
*Example of a high-resolution colored ASCII conversion.*

![Bad Apple](assets/bad-apple.gif)
*Real-time video processing and encoding.*

---

## ✨ Key Features

- **🚀 Performance First**: Optimized CPU-based processing using `Uint32Array` color packing and `willReadFrequently` canvas optimization.
- **🌈 Full Color Support**: Beyond simple grayscale—experience ASCII art in full RGB fidelity.
- **🎬 Advanced Compression**: 
    - **Delta Encoding**: Only store pixels that change between frames.
    - **Gzip Stream**: Native browser-level compression for ultra-small file sizes.
- **🛰️ Interdimensional Playback**: A dedicated decoder that can play back `.ascv` files in any web environment.
- **📦 Zero Dependencies**: Pure Vanilla JS. No heavy libraries, just pure logic.

---

## 🛠️ The .ASCV Ecosystem

We introduced the `.ascv` protocol to solve the problem of storing ASCII video. Instead of bulky MP4s or raw JSON strings, ASCII Architect uses a multi-layered compression approach.

### 📊 Real-World Comparison (Single Frame)
Tested with a 150-resolution colored source:

| Format | Storage Method | Final Size | Optimization |
| :--- | :--- | :--- | :--- |
| **🚫 Base64** | Text-encoded raw data | **~260 KB** | -33% (Bloated) |
| **📄 Raw JSON** | Plain text metadata | **~200 KB** | Raw Source |
| **🖼️ PNG** | **900x900 Pixels** | **33.8 KB** | Rendered Output |
| **📦 PNG.gz** | **900x900 Pixels** | **28.4 KB** | Compressed Render |
| **📟 .ASCV.GZ** | **Our Protocol** | **10.2 KB** | **The Logic Advantage** |

### 🧠 Why not just use a small PNG?
You might ask: *"Why not just use a 150x150 PNG?"* Here is why **.ASCV** is superior for ASCII needs:

1.  **Infinite Scalability**: A 150x150 PNG looks blurry when upscaled. Since **.ASCV** is a set of "Render Instructions," a single 10KB file can generate a **razor-sharp 4K ASCII output** without any pixelation.
2.  **Data Fidelity**: Traditional images lose the semantic meaning of the character grid. .ASCV preserves the exact character intent (e.g., using specific blocks '█', '▀') which is lost in standard image compression.
3.  **Low Overhead**: While a 150x150 PNG might be smaller than a 900x900 one, it still can't match the storage efficiency of our Delta-Gzip pipeline for terminal-style data.

---

## 🚀 Quick Start

### For Encoding:
```javascript
const processor = new AsciiProcessor();
processor.setSource(videoElement);
processor.options.resolution = 150;
processor.process();

const frame = processor.currentFrameData;
// { text, colors, width, height }
```

### For Decoding:
```javascript
const decoder = new VideoDecoder();
await decoder.load(fileBlob);
decoder.play((frame) => {
    AsciiProcessor.drawFrame(ctx, frame);
});
```

---

## 🎨 Rendering Modes

- **Grayscale**: Classic density-based character mapping.
- **Bayer Dithering**: 4x4 dithered patterns for a crisp, retro feel.
- **Binary**: High-contrast, two-tone terminal aesthetic.
- **Block Mode (2x1)**: Uses special characters (`█`, `▀`, `▄`) to double the vertical resolution and create sharp, pixel-art style results.

---

## 🤝 Contributing

This project is open for anyone who loves the intersection of retro aesthetics and modern web tech. Feel free to fork, experiment with new rendering modes, or implement your own UI wrappers!

---

## 📄 License

MIT © 2025 ChromaASCII
