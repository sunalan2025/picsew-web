## 2026-08-02 - [Replace weak Math.random with crypto.randomUUID]\n**Vulnerability:** Weak pseudo-random number generator Math.random() used to create IDs.\n**Learning:** Math.random() provides low entropy and predictability, which could cause ID collisions or predictability problems.\n**Prevention:** Always use standard cryptographically secure alternatives like crypto.randomUUID() for ID and token generation.
## 2026-08-04 - [Fix client-side DoS in image upload error handling]
**Vulnerability:** Unhandled FileReader and Image loading errors resulting in infinitely pending Promises.
**Learning:** Using `Promise.all` over a mapped array of file reading/loading promises without proper `onerror` handlers can cause a single malformed file to hang the entire application state.
**Prevention:** Always implement explicit error handlers in native browser APIs (like FileReader and HTMLImageElement) and resolve/reject wrapping Promises accordingly to fail securely.
