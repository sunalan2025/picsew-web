## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-08-03 - JSON.stringify Performance Bottleneck
**Learning:** Using `JSON.parse(JSON.stringify(obj))` for deep cloning state objects that contain large base64 string payloads (like image `src` in `src/App.tsx`) blocks the main thread synchronously. This causes noticeable UI lag when committing to the undo/redo history stack, especially with high-resolution or multiple images.
**Action:** Replace `JSON.parse(JSON.stringify(obj))` with shallow copying strategies (e.g., `.map(item => ({...item}))`) for arrays of objects when deep nested cloning is not strictly required.
