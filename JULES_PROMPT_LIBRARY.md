# 🤖 Jules AI 自动化代码优化与功能演进提示词库 (Picsew Web)

本指南专门为 **Picsew Web** (`sunalan2025/picsew-web`) 项目量身定制。包含已在 Jules 平台开启的**定时自主优化代理（Proactive & Skill Agents）**、针对 Picsew 的高级新功能工单，以及如何让 Jules 每日自动监控与迭代的完整机制。

---

## 📌 第一部分：已激活的 Jules 每日定时自主优化代理

我们已为您在浏览器中勾选并激活了以下 Jules 原生后台监控项：
1. **自动主动建议 (Enable proactive suggestions)**：Jules 将每隔几天自动扫描您的仓库，发现潜在缺陷、冗余代码与性能瓶颈并自动生成 PR。
2. **性能优化代理 (Performance Agent)**：专注于网页与移动端 Canvas 渲染帧率、内存占用及超大图片处理瓶颈的自动检测。
3. **视觉设计代理 (Design Agent)**：专注于 UI 响应式适配、Tailwind 样式微调与极简设计体验提升。
4. **安全与健壮性代理 (Security Agent)**：专注于上传图片 XSS 过滤、 Blob 生命周期管理与文件安全审计。

---

## 🚀 第二部分：Jules 高级演进工单库 (新功能 & 性能优化)

请根据需要，将以下最新设计的复杂功能工单分步派发给 Jules：

### 任务 1：智能图像重合度自动识别与重合裁剪算法 (Stitching Optimization) - 【已在 Jules 运行中】

```text
[Task] Implement Automatic Edge Overlap Detection for Image Stitching

[Context]
Currently, in `src/utils/stitching.ts` and `src/components/PreviewCanvas.tsx`, users have to manually drag the overlapping line or adjust top/bottom crop values for each image item to align overlapping screenshot areas.

[Requirements]
1. Add an automated overlap detection algorithm in `src/utils/stitching.ts` (e.g. using 1D/2D pixel normalized cross-correlation or mean absolute difference on image scanlines).
2. Create a utility function `detectOverlap(img1: HTMLImageElement | CanvasImageSource, img2: HTMLImageElement | CanvasImageSource, maxOverlapRatio?: number): number`.
3. In `ImageUploader.tsx` or `App.tsx`, when multi-images are uploaded, automatically trigger `detectOverlap` to pre-calculate and set the initial `overlap` property for adjacent image items.
4. Add an "Auto Align" (智能自动对齐) button in `ControlPanel.tsx` that recalculates overlap for selected or all images.
5. Ensure fallback to 0 overlap if confidence score is low or images have no matching patterns.

[Verification]
- Run `npm run build` and `npm run lint` to ensure zero compilation or lint errors.
```

---

### 任务 6：屏幕录像视频转长截图 (Video to Scrollshot)

> **🎯 提示词目的**：复刻 iOS Picsew 的“录屏转长截图”功能，让用户上传 `.mp4`/`.webm` 录屏文件，自动提取关键帧并拼合成一张完整的长截图。

```text
[Task] Implement Video-to-Scrollshot Conversion (Screen Recording Frame Extractor & Stitcher)

[Context]
Mobile users often record their screen scrolling through long feeds instead of taking dozens of static screenshots. We want Picsew Web to parse video files into stitched long images directly in browser.

[Requirements]
1. Create a utility `src/utils/videoStitcher.ts`:
   - Accept a `File` (mp4/webm video).
   - Use HTML5 `<video>` and `<canvas>` to sample video frames at regular intervals (e.g., every 300ms or when significant vertical motion occurs).
   - Filter out duplicate/static frames.
   - Run `detectOverlap` between consecutive extracted frames to form a clean image list.
2. Update `ImageUploader.tsx`:
   - Support video file input (`video/mp4, video/webm`).
   - Add a progress indicator (e.g. "Extracting frames: 45%...") when video is processing.
3. Import extracted frame images directly into the main `imageItems` state in `App.tsx`.

[Verification]
- Run `npm run build` and `npm run lint` to confirm clean compilation.
```

---

### 任务 7：敏感数据智能识别与一键自动马赛克脱敏 (OCR & Smart Auto-Blur)

> **🎯 提示词目的**：自动分析截图中包含的手机号、邮箱、身份证号及敏感数值，一键生成脱敏马赛克框。

```text
[Task] Implement Smart Sensitive Data Detection and One-Click Auto-Blur

[Context]
Users frequently share screenshots on social media and need to blur sensitive information like mobile numbers, email addresses, avatar names, or prices.

[Requirements]
1. Create a lightweight regex/pattern text bounds analyzer or integration in `src/utils/privacy.ts`:
   - Match common sensitive patterns: Phone numbers (`\d{11}`), Email addresses, and Account IDs.
2. In `ControlPanel.tsx` (Markup Tab):
   - Add a "Smart Redact" (智能脱敏) button under the Blur tool.
3. When clicked:
   - Analyze uploaded images for sensitive text bounding boxes.
   - Automatically add corresponding `blur` markup items into the canvas state over detected locations.
4. Provide a toggle to clear or adjust auto-generated blur boxes manually.

[Verification]
- Run `npm run build` and `npm run lint` to verify build validity.
```

---

### 任务 8：网页 URL 网址全文长截屏抓取 (Web Full-Page Snapshot)

> **🎯 提示词目的**：支持用户输入网页 URL，自动抓取网页完整长截图并导入拼接画布。

```text
[Task] Implement Web URL Full-Page Screenshot Capture Tool

[Context]
Users want to generate long screenshots of websites directly by typing a URL into Picsew Web.

[Requirements]
1. Create a component `src/components/WebSnapshotModal.tsx` or control in `ImageUploader.tsx`.
2. Allow users to enter a target URL.
3. Use a web snapshot proxy/API fallback or iframe canvas rendering to capture the full page as an image Blob.
4. Automatically append the captured full page screenshot into `imageItems` for editing, framing, and PDF export.

[Verification]
- Run `npm run build` and `npm run lint` to confirm clean compilation.
```

---

## 💡 第三部分：本地自动监控与调度配合

除了 Jules 云端自带的每日定时扫描以外，您可以随时在命令行或本 agent 对话中使用 `/schedule` 开启本地自动化监控，让本地 agent 定期自动轮询 Jules 生成的 PR 并自动审查！
