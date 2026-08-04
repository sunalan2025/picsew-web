## 2026-08-02 - [Replace weak Math.random with crypto.randomUUID]\n**Vulnerability:** Weak pseudo-random number generator Math.random() used to create IDs.\n**Learning:** Math.random() provides low entropy and predictability, which could cause ID collisions or predictability problems.\n**Prevention:** Always use standard cryptographically secure alternatives like crypto.randomUUID() for ID and token generation.

## 2025-02-14 - [Client-Side DoS via Canvas]
**Vulnerability:** Unbounded text input rendered to canvas (e.g. annotation text, status bar text) and SVG file uploads.
**Learning:** Even without a backend, large or complex inputs (like massive strings or malicious SVGs) can crash the browser or cause memory exhaustion when rendered to a canvas or processed by the browser.
**Prevention:** Always set `maxLength` on text inputs that dictate rendering output, and explicitly block vectors like SVGs unless specifically required (and safely parsed).
