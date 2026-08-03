## 2024-05-17 - Add explicit labels and focus states to dynamic lists
**Learning:** When rendering dynamic lists with inline action controls (like the image uploader list), icon-only buttons often lack `aria-label`s, breaking screen reader a11y, and small form elements lack `id` and `htmlFor` bindings.
**Action:** Always ensure dynamic list items generate unique `id`s for inputs and explicitly bind labels using `htmlFor`. Add `aria-label`, `title`, and explicit `focus-visible` states to icon-only controls.
