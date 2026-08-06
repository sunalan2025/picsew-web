## 2025-02-15 - Missing keyboard support in custom interactable elements & missing labels on icon buttons
**Learning:** Custom interactive elements (like drag & drop div areas) need explicit keyboard support (`tabIndex={0}`, `onKeyDown` for Enter/Space, and `role="button"` if they behave like buttons) for accessibility. Icon-only buttons often lack `aria-label`s, which is critical for screen reader users to understand their function. Missing focus indicators on these items also impacts keyboard navigation visibility.
**Action:** Always ensure that custom non-button interactable elements receive proper keyboard events/focus states, and any icon-only button includes descriptive `aria-label`s and `title` attributes. Add `focus-visible` styling everywhere.
## 2026-08-06 - [Color Picker Accessibility]
**Learning:** The color picker buttons lacked ARIA labels, meaning screen readers would just announce 'button'. Also lacked focus visible rings for keyboard users.
**Action:** Always map hex colors to semantic names for aria-labels, use aria-pressed for active state, and apply focus-visible styles to interactive elements.
