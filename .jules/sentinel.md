## 2025-02-14 - Replace Cryptographically Weak PRNG

**Vulnerability:** The application was using `Math.random().toString(36).substring(2, 9)` to generate unique IDs for images and annotations. `Math.random()` is cryptographically weak and predictable, and not suitable for security purposes, or even for generating unique IDs in a robust way where collisions could cause state issues.
**Learning:**  We identified a weak random number generation pattern used for assigning identifiers. While this specific usage might not immediately expose highly sensitive data, it's a poor security practice that can lead to predictable identifiers and ID collisions.
**Prevention:** Always use a cryptographically secure pseudo-random number generator (CSPRNG) when generating unique IDs, tokens, or any value that needs to be unpredictable. In modern web environments, the `crypto.randomUUID()` Web API provides a robust and secure way to generate UUIDs.
