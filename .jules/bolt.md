## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-08-17 - Render Loop Serialization
**Learning:** Calling `JSON.stringify` on complex object/array structures inside high-frequency render loops (like React `useCallback` functions tied to canvas drawing or mouse events) causes unnecessary CPU spikes and GC pressure, even if the result isn't always used to trigger a cache invalidation.
**Action:** When computing dependency strings or checksums for cache invalidation within a render loop, wrap the serialization in a `useMemo` hook with explicit React dependencies so the stringification only executes when the underlying data actually changes, not on every render frame.
