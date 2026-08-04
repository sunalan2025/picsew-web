## 2024-10-27 - [Color Picker Accessibility]
**Learning:** Static mapping objects defined within `.map` loops can cause slightly less readable and less optimal component code when adding aria-labels to lists of items. Reviewers notice this pattern.
**Action:** Extract static mapping objects (like color name maps) outside of the component or outside of iteration loops to keep the TSX cleaner and more performant.
