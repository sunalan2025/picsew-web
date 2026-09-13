## 2024-05-24 - Avoid Redundant Image Decoding in Loops
**Learning:** In sequential overlap detection loops, `loadImage` is called redundantly for the same image source across consecutive iterations (`imgB` of iteration `i` is `imgA` of iteration `i + 1`). This adds unnecessary asynchronous decoding overhead.
**Action:** Cache the parsed `HTMLImageElement` from the previous iteration. Ensure the cached value is reset to `null` inside any inner `catch` blocks to prevent stale data from corrupting subsequent iterations, while preserving the existing control flow.

## 2024-05-24 - Avoid Redundant Image Decoding in Loops
**Learning:** In sequential overlap detection loops, `loadImage` is called redundantly for the same image source across consecutive iterations (`imgB` of iteration `i` is `imgA` of iteration `i + 1`). This adds unnecessary asynchronous decoding overhead.
**Action:** Cache the parsed `HTMLImageElement` from the previous iteration. Ensure the cached value is reset to `null` inside any inner `catch` blocks to prevent stale data from corrupting subsequent iterations, while preserving the existing control flow.
