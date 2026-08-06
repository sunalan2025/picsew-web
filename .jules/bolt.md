## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-08-03 - getImageData Optimization

**Learning:** `ctx.getImageData()` triggers synchronous GPU-to-CPU readbacks which are exceptionally slow, and combining this with transient `document.createElement('canvas')` in a render loop causes severe garbage collection and layout thrashing.
**Action:** When performing pixel manipulations like blur or scaling, avoid `getImageData`. Instead, create a module-level cached off-screen canvas and use `ctx.drawImage` to copy the region directly. This keeps the data in GPU memory and drastically improves performance, especially during high-frequency events like dragging/drawing.
