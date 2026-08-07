## 2024-05-24 - [Tabs Empty State Requires Image Upload]
**Learning:** The ControlPanel component hides most tabs and settings behind an empty state if no images are uploaded.
**Action:** When writing automated UX verification tests (e.g. Playwright), always upload an initial image (like `public/favicon.svg`) to ensure the control panels are rendered before trying to assert against or take screenshots of their state.
