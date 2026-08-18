## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2025-02-24 - JSON.stringify Performance on Base64
**Learning:** Using `JSON.parse(JSON.stringify())` to deep clone state that contains large base64 image strings (`src`) completely blocks the main thread for hundreds of milliseconds, causing severe UI lag when updating history/state. Also, calling `JSON.stringify` inside hot render loops (like calculating dependency keys for `useCallback`) causes unnecessary overhead.
**Action:** For large objects with base64 data, use shallow copying (e.g., `.map(obj => ({...obj}))`) combined with targeted deep copying for nested arrays/objects instead of `JSON.parse(JSON.stringify())`. In high-frequency render loops, build cache keys using direct string concatenation (`val1 + val2`) instead of `JSON.stringify({val1, val2})`.
