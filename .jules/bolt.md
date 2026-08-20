## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-10-27 - Render Loop Dependency Caching Serialization
**Learning:** Using `JSON.stringify` to generate dependency cache strings inside high-frequency render loops (like `PreviewCanvas`'s `renderStitchedImage`) introduces significant CPU serialization overhead, especially for complex state objects.
**Action:** Replace `JSON.stringify` with direct template string concatenation mapping only the necessary properties to generate cache keys faster.

## 2024-10-27 - Deep State Object Cloning
**Learning:** Using `JSON.parse(JSON.stringify())` to clone large state structures containing base64 strings (like image sources in the history state) synchronously blocks the main browser thread.
**Action:** Always prefer targeted shallow copying (e.g., `.map(img => ({ ...img }))`) and targeted deep copying for nested array properties instead of blanket JSON serialization.
