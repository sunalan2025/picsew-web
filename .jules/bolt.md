## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-08-25 - History State Cloning Optimization

**Learning:** Using `JSON.parse(JSON.stringify())` to deep clone state objects for history/undo functionality causes severe synchronous main thread blocking when the state contains large base64 strings (like image sources). This can result in significant UI freezing and degraded UX.
**Action:** Always avoid `JSON.parse(JSON.stringify())` for objects containing large data payloads. Instead, use shallow copying (`.map(obj => ({...obj}))`) combined with targeted deep copying for specific nested properties (like arrays of coordinates) that actually require it.
