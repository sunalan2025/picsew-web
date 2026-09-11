## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-09-24 - Redundant Async Image Decoding in Sequential Operations
**Learning:** When processing an array of large media sources sequentially (e.g., when detecting overlap between adjacent image pairs using `detectOverlap(imgA, imgB)`), redundantly decoding the same image source into an `HTMLImageElement` via asynchronous operations (like `await loadImage()`) blocks execution unnecessarily, creates memory garbage, and slows down processing time by ~50%.
**Action:** Always cache the parsed `HTMLImageElement` (or similar heavyweight objects) from the previous iteration to reuse as `imgA` in the next iteration. Make sure to reset the cached value to `null` inside any inner `catch` blocks to prevent an error on one iteration from corrupting the input to subsequent iterations.
