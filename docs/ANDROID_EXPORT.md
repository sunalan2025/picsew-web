# Android 导出兼容性

- Android 10+ 使用 Downloads MediaStore，通过 IS_PENDING 暂存写入，成功后再发布，失败则删除不完整文件。
- Android 7–9 使用系统的 ACTION_CREATE_DOCUMENT 文件创建器，无需 WRITE_EXTERNAL_STORAGE 权限。用户选择保存位置后再写入。
- JavaScript Bridge 仍是现有 `AndroidApp.saveBase64File(base64, mimeType, filename)` 接口，前端无需修改。
- 以 64KB 的 Base64 块写入，限制单文件编码大小 64MiB，避免完整解码时额外的巨大数组；导出非常长的高质量图片可能仍超限，需要未来的原生流式文件 API。
- 限制 MIME，规范化文件名；每个旧版系统同时仅允许一个保存窗口。
- 验证：GitHub Actions Android debug 编译，仍需 Android 7/8/9/10/13/16 实际模拟器或真机保存测试。

## 保存结果与分享入口

新增 `saveFile(base64, mime, name, requestId)`，通过 `picsew-export-result` 将成功、失败、取消回传前端；旧 `saveBase64File` 保留兼容。Android 7–9 的系统文件选择器完成后才报告结果。

Activity 接收 `ACTION_SEND` / `ACTION_SEND_MULTIPLE` 图片。桥接只读取当前分享附件，最多 10 张、单张 20 MiB，前端另外限制总解码数据。APK 编译不替代真机保存和分享流程验收。
