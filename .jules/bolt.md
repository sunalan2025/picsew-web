## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-08-22 - State Deep Cloning Blocking Main Thread

**Learning:** Using `JSON.parse(JSON.stringify())` to deep clone state objects containing large base64 strings (like image sources in the `images` state) synchronously blocks the main browser thread. This causes noticeable UI lag when pushing state changes to an undo/redo stack during frequent operations like manual image stitching or adding annotations.
**Action:** Replace `JSON.parse(JSON.stringify())` with shallow copying (e.g., `newImgs.map(img => ({ ...img }))`) for state updates. If objects contain nested references (like drawing points for the `pen` tool), combine shallow copying with targeted deep copying for just those nested properties. This drastically reduces CPU work and avoids parsing large strings.
