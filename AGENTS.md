## Project overview

This repository contains **ChromaASCII**, an ASCII rendering and encoding engine primarily intended for **browser usage as a library**. It also includes demo UIs for images and videos, but the **source of truth** for the engine is in the core modules under `src/core` and `src/utils`.

- **Core engine (library surface)**:
  - `src/core/AsciiProcessor.js`: Converts images/videos/canvases into structured ASCII frame data and can render that data to a canvas.
  - `src/core/VideoEncoder.js`: Accepts a sequence of ASCII frames and produces compressed `.ascv.gz` blobs.
  - `src/core/VideoDecoder.js`: Decodes `.ascv`/`.ascv.gz` data and reconstructs frames over time.
  - `src/utils/BayerMatrix.js`: Helper for ordered dithering used by `AsciiProcessor`.
- **App UIs (examples / demos)**:
  - `src/app/image-app.js` and `image.html`: Image → ASCII and `.ascv` tools.
  - `src/app/video-app.js` and `video.html`: Video/GIF → ASCII and `.ascv` tools.

When extending or using this project, treat **`src/core` as the reusable library** and **`src/app` / `*.html` as reference implementations**.

## Guidance for future AI agents

- **Preferred APIs**
  - Use `AsciiProcessor` (from `src/core/AsciiProcessor.js`) as the main entry point for converting visual sources into ASCII:
    - Configure `processor.options` (resolution, modes, color settings).
    - Call `processor.setSource(imageOrVideoOrCanvas)`.
    - Optionally call `processor.setRenderCanvas(canvas)` for automatic drawing.
    - Call `processor.process()` and read `processor.currentFrameData`.
  - Use the static `AsciiProcessor.drawFrame(ctx, frameData)` to render **pre-generated ASCII frames** (e.g., decoded from `.ascv`, loaded from JSON, or generated elsewhere) onto any 2D canvas context.
  - Use `VideoEncoder` (`src/core/VideoEncoder.js`) to build `.ascv` / `.ascv.gz` from a sequence of frames.
  - Use `VideoDecoder` (`src/core/VideoDecoder.js`) to decode `.ascv` / `.ascv.gz` and drive playback via callbacks that call `AsciiProcessor.drawFrame`.

- **Architecture rules**
  - Keep **core engine files** (`src/core`, `src/utils`) **UI-agnostic**:
    - Do **not** introduce direct DOM access, global document queries, or hard-coded element IDs in these modules.
    - Prefer passing in canvases, contexts, or configuration objects instead of reading them globally.
  - Place browser-specific wiring (DOM events, drag-and-drop, file inputs, buttons, etc.) in `src/app` or other app-level modules.
  - If adding helper functions that wrap the core API (e.g., “encode one image to `.ascv.gz`”), prefer placing them in a small, dedicated module that itself depends on `src/core`, keeping responsibilities clear.

- **How to answer future questions**
  - When the user wants to **use this as a library in a browser page**:
    - Show `import` examples using ES modules, e.g.:
      - `import { AsciiProcessor } from './src/core/AsciiProcessor.js';`
      - `import { VideoEncoder } from './src/core/VideoEncoder.js';`
      - `import { VideoDecoder } from './src/core/VideoDecoder.js';`
    - Prefer examples that:
      - Operate on an `HTMLImageElement`, `HTMLVideoElement`, or offscreen canvas as the source.
      - Render onto a `<canvas>` using `AsciiProcessor.drawFrame`.
  - For detailed engine behavior and data formats, refer to and extend `CORE_DOCS.md` rather than duplicating long explanations.
  - Preserve and respect the `.ascv` format and playback behavior exposed by `VideoEncoder` and `VideoDecoder`.

## Documentation pointers

- **Core usage & formats**: See `CORE_DOCS.md` for how to:
  - Configure `AsciiProcessor` options.
  - Use `VideoEncoder` and `VideoDecoder`.
  - Understand the `.ascv` JSON structure.
- **Browser quickstart**:
  - If not already present, add or update a concise “Browser library quickstart” section in `CORE_DOCS.md` that:
    - Shows how to display pre-generated ASCII frames with `AsciiProcessor.drawFrame`.
    - Shows how to generate ASCII from an image/video and save it (PNG or `.ascv.gz`).
