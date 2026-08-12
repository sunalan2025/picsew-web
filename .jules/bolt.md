## 2024-08-02 - Canvas Optimization

**Learning:** Re-assigning canvas dimensions (`canvas.width = canvas.width`) forces the browser to re-allocate the underlying graphics buffer and clear the canvas, which is an expensive operation that can cause layout thrashing. This is a common performance bottleneck in canvas-heavy React components like `PreviewCanvas.tsx` when re-rendering based on user interaction (like mouse moves or drawing annotations).
**Action:** When updating canvas dimensions within a `useCallback` or `useEffect` render pipeline, conditionally set them only if they have actually changed (`if (canvas.width !== targetW) canvas.width = targetW`). Since avoiding dimension re-assignment stops the implicit clear, explicitly call `clearRect` when the dimensions remain the same to prevent visual ghosting/artifacts.

## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2024-08-12 - Canvas Resize and clearRect double-clear bottleneck
**Learning:** Re-assigning canvas dimensions inherently clears the canvas graphics buffer. When updating canvas properties dynamically, a common flawed pattern is `if (w !== target) ... if (h !== target) ... else clearRect(...)`. If only width changes, clearRect is skipped, but height is incorrectly not updated. Or, if you use a sequential `if (w) ... if (h) ... clearRect()` block unconditionally, you will cause an expensive double-clear of the buffer when a resize actually occurs.
**Action:** Always track canvas resizing explicitly with a local flag: `let resized = false; if (canvas.width !== w) { canvas.width = w; resized = true; } if (canvas.height !== h) { canvas.height = h; resized = true; } if (!resized) clearRect(0, 0, w, h);`. This avoids expensive double-clearing bugs.
