# Jules & AI Agent Guidelines for Picsew Web

Welcome, Jules! This document provides instructions and constraints for autonomous AI coding agents working on `picsew-web`.

## 1. Project Overview & Tech Stack
- **Project Name**: Picsew Web (`sunalan2025/picsew-web`)
- **Description**: A modern web and cross-platform mobile long-screenshot stitching, cropping, device mockup, and markup editing tool.
- **Frontend Stack**: React 19, Vite 8, TypeScript 6, Tailwind CSS v4, Lucide React icons.
- **Mobile Stack**: Capacitor v8 (Android APK & iOS PWA / Native wrapper).
- **Key Libraries**: `jspdf` (PDF export), `jszip` (slice zip packaging), `oxlint` (linter).

## 2. Directory Structure & Key Files
- `src/App.tsx`: Main UI workflow, tab navigation (Stitch / Mockup / Markup / Export), and state management.
- `src/components/PreviewCanvas.tsx`: Core interactive canvas rendering screenshots, stitching lines, overlapping adjustments, device mockups, and annotations.
- `src/components/ControlPanel.tsx`: Sidebar / control panel for adjusting gap, crop top/bottom/left/right, mockup framing, and markup drawing tools.
- `src/components/ImageUploader.tsx`: Multi-image uploader supporting drag-and-drop, clipboard paste, and sorting.
- `src/utils/stitching.ts`: Canvas image stitching algorithms, offset positioning, overlapping calculations.
- `src/utils/mockup.ts`: Device frame SVG/Canvas rendering logic (iPhone 14/15 Notch & Dynamic Island, status bars, shadows).
- `src/utils/statusBar.ts`: Time, battery, cellular signal status bar generation logic.
- `src/types.ts`: Core TypeScript interface definitions (`ImageItem`, `CropOptions`, `MarkupItem`, `DeviceMockupOptions`).

## 3. Strict Coding Conventions & Execution Rules
1. **Validation before PR**:
   - Always verify that the project builds cleanly without TypeScript or Vite errors:
     ```bash
     npm run build
     ```
   - Run the linter to ensure code style compliance:
     ```bash
     npm run lint
     ```
2. **State & Immutability**:
   - Do NOT mutate state directly (e.g. `imageItem.cropTop = 10`). Always return new state objects or arrays to ensure React re-renders correctly.
   - Maintain undo/redo history stack integrity when modifying canvas markup elements or crop parameters.
3. **Performance & Memory Management**:
   - Always revoke created Blob URLs (`URL.revokeObjectURL(url)`) when images are removed or canvas outputs are cleaned up to prevent memory leaks on mobile devices.
   - Avoid blocking heavy synchronous canvas computations on the main thread for large image collections.
4. **Mobile & Cross-Platform Compatibility**:
   - Ensure touch events (`onTouchStart`, `onTouchMove`, `onTouchEnd`) work seamlessly alongside mouse events (`onMouseDown`, etc.).
   - Support standard PWA display standards and Capacitor Android download handlers.

## 4. Work Execution Checklist for Agent
- [ ] Read existing files before editing to understand component data flows.
- [ ] Implement requested feature or bug fix with minimal, clean code.
- [ ] Keep TypeScript types strict (avoid `any` unless absolutely necessary).
- [ ] Run `npm run build` to verify standard build output.
