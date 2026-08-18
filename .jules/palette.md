## 2025-02-12 - ControlPanel Tab and Tool Button Accessibility Pattern
**Learning:** The application uses a custom tabbed interface (`ControlPanel.tsx`) and many tool selection buttons that were built using standard `<button>` elements with `div` containers. These lacked essential ARIA standard roles (`tablist`, `tab`, `tabpanel`), state indicators (`aria-selected`, `aria-pressed`, `aria-controls`), and keyboard focus indicators (`focus-visible:ring`), making them difficult for screen reader and keyboard users to navigate effectively.
**Action:** Always ensure custom tab interfaces are mapped to standard WAI-ARIA roles (`tablist`, `tab`, `tabpanel`) with appropriate `aria-labelledby` and `aria-controls`. Ensure all icon/tool buttons have `aria-pressed` states when they function as toggles. Consistently use `focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none` on interactive elements to provide visual feedback for keyboard navigation.

## 2025-02-15 - Missing keyboard support in custom interactable elements & missing labels on icon buttons
**Learning:** Custom interactive elements (like drag & drop div areas) need explicit keyboard support (`tabIndex={0}`, `onKeyDown` for Enter/Space, and `role="button"` if they behave like buttons) for accessibility. Icon-only buttons often lack `aria-label`s, which is critical for screen reader users to understand their function. Missing focus indicators on these items also impacts keyboard navigation visibility.
**Action:** Always ensure that custom non-button interactable elements receive proper keyboard events/focus states, and any icon-only button includes descriptive `aria-label`s and `title` attributes. Add `focus-visible` styling everywhere.

## 2025-02-15 - Playwright UI Interaction Verification
**Learning:** To interact with specific UI tools conditionally rendered in the Control Panel during Playwright verification (like testing confirmation dialogs), you must first ensure the relevant parent tab is clicked to reveal the buttons, and you must add `page.on("dialog", lambda dialog: dialog.accept())` to prevent the test from hanging on `window.confirm`.
**Action:** Always ensure UI elements are rendered by their parent containers before interacting with them in verification scripts, and register dialog handlers when verifying native confirmation popups.


## 2025-02-18 - Expand hit areas for form inputs
**Learning:** Forms and control panels with inputs (checkboxes, color pickers, text inputs) that lack explicit id and <label htmlFor="..."> associations have small clickable hit areas, degrading accessibility, especially for touch users.
**Action:** Always explicitly associate <label> with inputs using htmlFor and id to expand clickable areas.
