## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.
## 2026-09-10 - Cached Image Decoding for Overlap Detection
**Learning:** In sequential overlap detection loops, both `imgA` and `imgB` are decoded via `loadImage()` on every iteration, leading to O(2N) async overhead. Since `imgB` from the current iteration is logically identical to `imgA` in the next iteration, failing to cache the decoded `HTMLImageElement` between loop cycles wastes significant main-thread time and memory on duplicate decoding.
**Action:** Always maintain a `prevImg` caching variable in loops processing sequential image pairs. Set `imgA = prevImg || await loadImage(src)` and update `prevImg = imgB` at the end of the iteration, effectively cutting decoding time by ~50% (O(N)). Make sure to reset `prevImg = null` inside any iteration-level `catch` blocks to prevent stale data corruption.
