## 2026-08-02 - [Replace weak Math.random with crypto.randomUUID]\n**Vulnerability:** Weak pseudo-random number generator Math.random() used to create IDs.\n**Learning:** Math.random() provides low entropy and predictability, which could cause ID collisions or predictability problems.\n**Prevention:** Always use standard cryptographically secure alternatives like crypto.randomUUID() for ID and token generation.
## 2026-08-04 - [Fix client-side DoS in image upload error handling]
**Vulnerability:** Unhandled FileReader and Image loading errors resulting in infinitely pending Promises.
**Learning:** Using `Promise.all` over a mapped array of file reading/loading promises without proper `onerror` handlers can cause a single malformed file to hang the entire application state.
**Prevention:** Always implement explicit error handlers in native browser APIs (like FileReader and HTMLImageElement) and resolve/reject wrapping Promises accordingly to fail securely.
## 2024-05-24 - [CSP Meta Tag Limits]
**Vulnerability:** Weak Content Security Policy
**Learning:** Adding `frame-ancestors` directive to CSP in a `<meta>` tag is ignored by browsers and causes warnings, representing security theater.
**Prevention:** Only use `frame-ancestors` in server HTTP response headers, and rely on valid meta tag directives like `object-src 'none'`, `base-uri 'none'`, and `form-action 'self'` for HTML files.

## 2024-05-24 - [Client-Side Image Validation Pitfalls]
**Vulnerability:** Client-Side File Signature Validation Regression
**Learning:** Client-side magic byte parsing often breaks perfectly valid image uploads (e.g. GIFs, SVGs, or JPEGs with different APP markers) and offers no real protection since the browser securely sandboxes image decoders anyway.
**Prevention:** Avoid implementing complex client-side magic byte validation for user-uploaded images; rely on other defense-in-depth methods (like CSP or strict size limits) instead.

## 2024-05-24 - [Fix Image Bomb / Pixel Flood OOM DoS]
**Vulnerability:** Unrestricted uncompressed pixel footprint in client-side image processing.
**Learning:** In Canvas-heavy applications, file size limits are insufficient to prevent OOM DoS attacks (Image Bombs/Pixel Floods). A small, highly compressed image can expand to a massive bitmap in memory, causing the browser tab to crash.
**Prevention:** Always validate the uncompressed pixel footprint (e.g., `img.naturalWidth * img.naturalHeight`) of uploaded images before processing them in memory or rendering them to a `<canvas>`.
