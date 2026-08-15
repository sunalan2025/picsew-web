## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2025-02-23 - Render Loop Re-evaluation CPU spikes
**Learning:** Computing expensive operations like `JSON.stringify` directly inside the closure body of high-frequency dependency loops or `useCallback` hooks (like `renderStitchedImage`) causes unnecessary CPU spikes during interactive events, such as moving the mouse or drawing annotations.
**Action:** Extract expensive variable generation into a separate `useMemo` dependency tracker and pass its result directly into the rendering loop or computation closure.
