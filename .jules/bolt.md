## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.
## 2024-06-25 - Avoid JSON.stringify for Cache Keys and State Cloning with Base64 Images
**Learning:** Using `JSON.parse(JSON.stringify())` to deep clone state that contains large base64 image strings (like `StitchedImage.src`) synchronously blocks the main thread and can cause noticeable UI stuttering. Similarly, using `JSON.stringify` inside high-frequency render loops (like calculating `currentDeps` in canvas rendering) adds unnecessary CPU overhead.
**Action:** When deep cloning complex state with heavy properties, use shallow copying (e.g., `[...arr]`, `{...obj}`) and target specific nested arrays/objects for deep cloning. For dependency tracking in React or manual cache invalidation, use direct string concatenation (e.g., `.join('|')`) to build cache keys instead of `JSON.stringify`.
