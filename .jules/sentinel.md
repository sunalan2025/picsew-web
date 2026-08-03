## 2024-03-24 - [Client-Side DoS Prevention]
**Vulnerability:** Missing input limits on client-side image uploads and canvas slice generation could lead to memory exhaustion and browser crashes (DoS).
**Learning:** In purely client-side apps, heavy operations like `canvas.toDataURL` in loops or loading massive arrays of files can easily exceed browser memory limits. We need defensive bounds checking even without a backend.
**Prevention:** Always implement hard upper limits for user-provided counts (e.g. max files to upload, max slices to generate) and file sizes on the client side before triggering heavy processing.
