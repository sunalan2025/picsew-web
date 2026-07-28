# Picsew Web - 专业长截图拼接与编辑工具 ✂️

一个基于 React + TypeScript + Vite 构建的现代化长截图拼接与编辑工具，支持智能边缘裁剪、重合度对齐、长图导出、PDF 生成、分段切片打包，并提供 Android APK 原生支持与 iPhone iOS PWA（添加到主屏幕）免安装原生体验。

👉 **在线体验地址**: [https://sunalan2025.github.io/picsew-web/](https://sunalan2025.github.io/picsew-web/)

---

## 🚀 核心功能特色

1. **🎨 智能长图拼接 (Stitch Mode)**
   - 自动拼合多张截图，支持自定义接缝间距 (Gap)。
   - 提供可视化重合度指示线，支持通过触控或鼠标上下拖拽，微调每张图片的重合遮挡范围，完美对齐。
2. **✂️ 四向边缘裁切 (4-Way Border Crop)**
   - 拖动指示线可直接裁剪图片的顶部 (cropTop) 和底部 (cropBottom) 边框（如屏蔽多余的状态栏、导航栏）。
   - 支持精细微调左右边框 (cropLeft/cropRight)，支持对单张图片进行定制化裁切。
3. **📱 原生设备外壳包裹 (Device Mockup wrapper)**
   - 提供 iPhone 14 / iPhone 15 等主流设备的外壳包裹。
   - 自动生成符合设备比例的圆角剪裁，支持“经典刘海屏 (Notch)”或“灵动岛 (Dynamic Island)”渲染。
   - 自动生成定制的时间、电量、Wifi/Cellular 状态栏，并提供高反差金属边框与立体投影效果。
4. **🖌️ 标注画笔与脱敏工具 (Markup Editor)**
   - 提供自由画笔 (Pen)、箭头指示 (Arrow)、矩形高亮 (Rectangle) 及文字备注 (Text) 功能。
   - 支持马赛克/高斯模糊脱敏工具 (Blur/Pixel Mosaic)，拖动框选即可快速遮盖敏感信息。
5. **💾 多格式高清导出**
   - **下载长截图**：支持 PNG 与高保真 JPEG 格式长图下载。
   - **导出 PDF**：支持长图无缝渲染为单页 PDF，或自动按标准 A4 比例进行分页 PDF 转换。
   - **打包分段切片**：支持将拼合的长图按指定高度切分为多张图片，并一键打包为 ZIP 压缩包下载。
6. **🔄 撤销重做队列 (Undo/Redo)**
   - 内置高精度状态回溯队列，支持最多 5 步撤销与重做操作，防止误剪。

---

## 📱 移动端与跨端支持

- **iPhone (iOS) 极速接入 PWA**
  - 项目配置了标准的 iOS Standalone 元标记。
  - 用 iPhone Safari 浏览器打开在线链接，点击 **“分享” -> “添加到主屏幕”**。即可在手机桌面上生成独立无浏览器外壳的 App 窗口，体验与原生无异！
- **Android APK 原生编译**
  - 项目整合了 Capacitor 原生混合开发框架，在根目录下产出了 **`Picsew_v1.0.0.apk`**。
  - 在 Android 混合模式下，通过原生 `JavascriptInterface` 拦截 WebView 的 Blob/Base64 下载流，直接解码保存到手机的系统公共 **Downloads (下载)** 目录下并弹出原生 `Toast` 提示，体验完美闭环。

---

## 🛠️ 本地开发指南

### 1. 克隆与依赖安装
确保您安装了 Node.js 环境：
```bash
# 安装依赖
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```
打开浏览器访问 `http://localhost:5173/`。

### 3. 构建发布版本
```bash
npm run build
```
打包产物将输出在 `dist/` 文件夹中。

---

## 🛡️ 开源许可 (License)

本项目采用 [MIT License](LICENSE) 许可协议。
