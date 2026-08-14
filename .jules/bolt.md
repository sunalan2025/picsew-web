
## 2024-05-18 - Canvas Drawing Loop Optimization
**Learning:** Re-rendering many high-resolution images to the canvas on every `mousemove` event (such as when drawing annotations) causes massive CPU spikes and severe frame drops.
**Action:** Always implement a background layer caching mechanism (via off-screen canvas) for static content in interactive drawing tools so `mousemove` only redraws the active annotation and composite the cached background.

## 2026-08-14 - Canvas Clearing Anti-Pattern Optimization
**Learning:** Checking a dimension (like width) and only clearing if the other dimension (height) doesn't change (`if (width != w) w=width; if (height != h) h=height; else clearRect() `) leads to redundant double clears when ONLY the width changes (because the explicit `clearRect` is skipped, but the assignment implicitly cleared it anyway).
**Action:** Use a unified boolean flag to track if ANY dimension changed. If a dimension changed, the canvas is implicitly cleared. ONLY call `clearRect` if the flag remains false, ensuring exactly zero redundant buffer clear operations.
