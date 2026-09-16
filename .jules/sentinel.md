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

## 2025-02-16 - Prevent UI Flooding (Client-Side DoS) in loops
**Vulnerability:** Synchronous \`alert()\` calls inside file processing loops (\`.filter\`, \`.map\`) caused the browser UI thread to lock up entirely when users uploaded a batch of invalid files (e.g. lots of SVGs or oversized images).
**Learning:** Sequential UI-blocking validation in batch processing enables a client-side Denial-of-Service via UI Flooding. Also, missed checking \`event.target?.result\` existence in \`FileReader.onload\` could lead to silent crashes.
**Prevention:** Always aggregate validation errors within loops and present a single summary alert outside the loop. Always check truthiness of async read results like \`FileReader\` before usage.
