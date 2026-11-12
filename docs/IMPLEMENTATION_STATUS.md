# Picsew Web implementation and validation

This work extends the existing local-first web editor. It does not claim feature parity with the proprietary iOS application. The GitHub Pages workflow validates and builds on Node 24, uses the official npm registry, and emits build-info.json and a page build marker so the published commit can be verified.

## Implemented

- Complete project history: images, crops, seams, direction, gap, annotations, status bar, device frame, watermark, and export settings. Up to 50 undo steps; successive changes to the same setting are grouped. Direction changes create an atomic history step before asynchronous alignment, so undo also cancels an in-flight direction change correctly.
- Shared source-image layout and original-pixel annotation anchors. Cropping, reordering, normalization and split slices reuse original coordinates. Selection, dragging, proportional resizing, recoloring, text editing, and deleting individual annotations.
- Independent final renderer used by image, clipboard, share, PDF and ZIP export. Editing guides and temporarily hidden frames cannot alter the saved result.
- Mixed-resolution seam matching normalizes both axes into the next image's pixel scale. Candidate search runs in a dedicated worker. Per-seam overlay magnifier, opacity, 1/10-pixel adjustments, keyboard controls and individual rematching.
- Stable top/bottom band suggestions with explicit confirmation; manual proportional batch cropping remains available.
- Unified pointer capture, one-finger browsing, two-finger focal-point zoom, double-tap/double-click zoom, and edge scrolling while marking. Releasing a gesture outside the canvas still completes it.
- Video interval preview, extraction of a selected interval (up to 180 seconds), supplemental extraction at the current frame, source timestamps, progress and cancellation. Image frame storage uses Blob URLs rather than Base64.
- Blob-based imports with a per-image 25 MP limit and a total project 80 MP budget. Sequential thumbnail decoding, bounded preview buffers (8 MP / 8192-pixel long axis), and release of assets no longer referenced by the project or undo history.
- Export content-width control, JPEG quality, actual encoded dimensions/size feedback, single-page PDF PPI and landscape support. Long unframed PDF/ZIP output is rendered in tiles; watermarks keep their global position and neighboring pixels are included for blur/mosaic at tile boundaries.
- IndexedDB draft save, explicit restore/new-project choice, and recovery of source blobs and complete project settings. Storage failures are shown; an existing draft is not silently overwritten before the user chooses.
- PWA manifest and icons, production service worker precaching including export chunks and stitch worker, offline app shell, local-only multipart share target, and global clipboard import.
- Additional iPhone 16 Pro and generic Android frame presets, frame color/width, and content rotation. These are original vector approximations, not official Apple device artwork.
- Android image share intents; a bounded reader exposes only attachments received by the activity. Native export callbacks distinguish success, failure and cancellation. Legacy save API remains supported.
- Official Gradle and Maven sources replace regional mirrors; wrapper distribution checksum is pinned. PDF/ZIP libraries load on demand.

## Validation

Run:

```sh
npm run lint
npm test
npm run build
# Install the same isolated browser tooling used by CI.
npm install --no-save --package-lock=false playwright@1.55.0
npx playwright install chromium
npm run test:browser
```

A local system Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. The browser tests start and stop their own servers. Tests cover mouse and emulated touch, crop geometry, actual downloaded PNG pixels, project history, annotation editing, draft restore, real WebM decode/seek/cancellation, worker matching, tile watermark/mosaic parity, native bridge results and offline share import.

For Android, use JDK 21, Android SDK 36 and Build Tools 35.0.0 (the Android Gradle plugin's default) plus 36.0.0:

```sh
npm run build
npx cap sync android
cd android
./gradlew assembleDebug --no-daemon --max-workers=2
```

The cloud validation uses the inherited HTTPS proxy and supplied Java CA trust; no TLS or artifact integrity verification is disabled. The local Android SDK and JDK are development prerequisites outside the repository, not committed source.

## Explicit remaining limits

- Android API 24/26/28/29/33/36 device or emulator tests, iOS Safari tests, installed OS share-sheet behavior, and actual photo-library save visibility still need device validation. Desktop Chromium emulation does not establish these.
- Real, authorized iOS/Android recording datasets are still needed to report seam error, dropped/duplicated text, performance and peak memory. The included test video is synthetic and demonstrates decoding, not real-world stitching accuracy.
- Preview resolution is bounded. Full PNG/JPEG output is limited to 32 MP and a 30000-pixel side. Larger unframed documents can use tiled PDF/ZIP; very large framed output must be reduced in width. Input remains capped at 50 images and video extraction at 40 retained frames.
- HEIC decoding/export, searchable OCR PDFs, browser-wide full-page capture, iOS native extensions and Shortcuts are not implemented in the pure web editor. They need codec/native/extension work beyond these browser capabilities; no arbitrary URL capture or private content upload is introduced.
- PWA installation and POST share targets depend on browser/OS support. Offline mode is available after a successful production service-worker installation; first-ever offline visits cannot load an uncached application.
- Drafts are local browser storage, subject to quota, browser eviction and private-mode restrictions; they are not cloud backups.

## Issue resolution evidence

- **#102 — fixed:** implementation commit `15a7f8d` unifies original-pixel layout, normalizes differently sized inputs for matching and seam dragging, and keeps axis and seam values together in history. The browser suites exercise horizontal and vertical composition on desktop and emulated touch devices, cross-axis cropping, 1-pixel seam adjustment, undo/redo, aspect preservation and downloaded PNG pixel parity. The mixed-resolution browser check detects the expected 150-source-pixel overlap, and the final renderer is independent of the selected tool. The full 53-test suite, lint, build and all three browser suites passed before publication. GitHub Pages deployment #46 succeeded for the implementation commit.
- **#101 — retain for device acceptance:** Android API 24–28 uses the existing SAF path and API 29+ uses MediaStore. Native success/failure/cancellation callbacks and debug APK compilation were verified, but API 24/26/28/29/33/36 device save visibility and system picker behavior have not been verified.
- **#105 — retain as roadmap:** interval extraction, supplemental frames, local drafts, seam inspection and share integration are implemented. Browser-wide full-page capture, iOS native integrations and real recording accuracy benchmarks remain outstanding.
- **#106 — retain for upstream fixes:** a fresh official-registry `npm audit --json` on 2026-11-08 still reports four moderate findings (`@capacitor/cli`, `glob`, `minimatch`, `rimraf`), zero high and zero critical. The installed audit report provides no automatic fix; it does not establish that all dependencies are vulnerability-free.

## 2026-11-10: local security and beginner workflow follow-up

These changes were prepared and validated locally on 2026-11-10. Publication through the existing GitHub Pages workflow was authorized on 2026-11-12. The deployed revision can be checked against the site's `build-info.json` and the GitHub Actions deployment result.

- Update the compatible CLI chain from rimraf 6.1.3 / glob 13.0.6 / minimatch 10.2.6 to rimraf 6.1.4 / glob 14.0.4 / minimatch 11.0.5. Capacitor CLI remains 8.6.0 and is classified as a development dependency. No major CLI downgrade, forced audit repair, or advisory suppression is used. Both full and production official-registry audits return zero known advisories; this is a point-in-time audit result.
- Add a security audit command that blocks moderate/high/critical findings and incomplete or failed registry responses. PR validation, deployment validation and the scheduled audit use the gate; JSON reports are retained for CI review.
- Validate raster file signatures before decoding; reject disguised SVG/unsupported image content. Bound share batches to 80 MB and the pending share inbox to three batches, preserving existing entries when capacity is reached. Reopening the app recovers the oldest interrupted share without requiring its original redirect URL. Ignore malformed native save events while awaiting a valid result.
- Add three-step navigation, an original local demo, a simple help panel, a plain-language save action, an explicit visual seam confirmation, actionable import/save errors and optional advanced save settings. Demo images do not enter personal draft storage.
- Frozen-lockfile reinstall, full and production audits, CLI glob cleanup/cancellation and Android synchronization are checked. The new browser suite exercises desktop/mobile demo-to-own-image flows, import rejection/retry, seam confirmation and downloaded PNG output. Existing browser suites remain part of validation.

Issue #106's historical four-moderate report above is superseded for this dependency tree. The release commit references the issue so GitHub can close it when the fix reaches the default branch. The cloud environment configuration is unchanged.
