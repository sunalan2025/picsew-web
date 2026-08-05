## 2025-02-15 - Missing keyboard support in custom interactable elements & missing labels on icon buttons
**Learning:** Custom interactive elements (like drag & drop div areas) need explicit keyboard support (`tabIndex={0}`, `onKeyDown` for Enter/Space, and `role="button"` if they behave like buttons) for accessibility. Icon-only buttons often lack `aria-label`s, which is critical for screen reader users to understand their function. Missing focus indicators on these items also impacts keyboard navigation visibility.
**Action:** Always ensure that custom non-button interactable elements receive proper keyboard events/focus states, and any icon-only button includes descriptive `aria-label`s and `title` attributes. Add `focus-visible` styling everywhere.

## 2025-08-05 - Missing labels and clear states on color picker buttons
**Learning:** The color picker buttons in the ControlPanel lacked `aria-label`, `title`, and `aria-pressed` states, making them inaccessible to screen reader users and confusing for keyboard navigation. Color-only interactive elements must have textual equivalents.
**Action:** Always add `aria-label`, `title`, `aria-pressed`, and `focus-visible` styling to color picker or icon-only buttons so users relying on screen readers or keyboards understand their purpose and state.
