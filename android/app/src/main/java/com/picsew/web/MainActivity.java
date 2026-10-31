package com.picsew.web;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Save exports on Android 7+ without legacy broad storage permissions.
 * Android 10+ uses MediaStore Downloads; Android 7-9 opens SAF document picker.
 */
public class MainActivity extends BridgeActivity {
    private static final int CREATE_DOCUMENT_REQUEST = 7451;
    private static final int MAX_ENCODED_LENGTH = 64 * 1024 * 1024;
    private static final int BASE64_CHUNK_SIZE = 64 * 1024; // divisible by 4

    // Only touched on the main thread. At most one pending Android 7-9 SAF request.
    private String pendingLegacyBase64;
    private String pendingLegacyName;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void saveBase64File(String base64Data, String mimeType, String filename) {
                final String name = sanitizeFilename(filename);
                final String mime = allowedMime(mimeType);
                if (base64Data == null || base64Data.isEmpty() ||
                        base64Data.length() > MAX_ENCODED_LENGTH ||
                        (base64Data.length() % 4 != 0)) {
                    showToast("文件无效或过大，请尝试降低导出画质");
                    return;
                }
                if (mime == null) {
                    showToast("不支持的导出格式");
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    new Thread(() -> saveWithMediaStore(base64Data, mime, name),
                            "picsew-export").start();
                } else {
                    runOnUiThread(() -> openLegacyDocumentPicker(base64Data, mime, name));
                }
            }
        }, "AndroidApp");
    }

    private static String allowedMime(String mime) {
        if ("image/png".equals(mime) || "image/jpeg".equals(mime) ||
                "application/pdf".equals(mime) || "application/zip".equals(mime)) {
            return mime;
        }
        return null;
    }

    private static String sanitizeFilename(String name) {
        if (name == null || name.trim().isEmpty()) return "Picsew_export";
        String safe = name.replace('/', '_').replace('\\', '_')
                .replace('\n', '_').replace('\r', '_').trim();
        if (safe.equals(".") || safe.equals("..")) return "Picsew_export";
        return safe.length() > 120 ? safe.substring(0, 120) : safe;
    }

    /** Stream chunks instead of allocating another huge decoded byte array. */
    private static void writeDecodedBase64(String data, OutputStream output) throws IOException {
        for (int start = 0; start < data.length(); start += BASE64_CHUNK_SIZE) {
            int end = Math.min(data.length(), start + BASE64_CHUNK_SIZE);
            final byte[] bytes;
            try {
                bytes = Base64.decode(data.substring(start, end), Base64.NO_WRAP);
            } catch (IllegalArgumentException e) {
                throw new IOException("Base64 解码失败", e);
            }
            output.write(bytes);
        }
        output.flush();
    }

    private void saveWithMediaStore(String base64, String mime, String name) {
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("创建下载条目失败");
            try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
                if (out == null) throw new IOException("无法写入下载目录");
                writeDecodedBase64(base64, out);
            }
            ContentValues completed = new ContentValues();
            completed.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(uri, completed, null, null);
            showToast("已保存到下载目录：" + name);
        } catch (Exception error) {
            if (uri != null) {
                try { getContentResolver().delete(uri, null, null); }
                catch (Exception ignored) { /* cleanup is best-effort */ }
            }
            showToast("文件保存失败：" + error.getMessage());
        }
    }

    private void openLegacyDocumentPicker(String base64, String mime, String name) {
        if (pendingLegacyBase64 != null) {
            showToast("请先完成上一个文件的保存");
            return;
        }
        pendingLegacyBase64 = base64;
        pendingLegacyName = name;
        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(intent, CREATE_DOCUMENT_REQUEST);
        } catch (Exception error) {
            pendingLegacyBase64 = null;
            pendingLegacyName = null;
            showToast("无法打开保存窗口：" + error.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CREATE_DOCUMENT_REQUEST) return;
        String encoded = pendingLegacyBase64;
        String name = pendingLegacyName;
        pendingLegacyBase64 = null;
        pendingLegacyName = null;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            showToast("已取消保存");
            return;
        }
        if (encoded == null) return;
        Uri destination = data.getData();
        new Thread(() -> {
            try (OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                if (out == null) throw new IOException("无法写入选中的位置");
                writeDecodedBase64(encoded, out);
                showToast("已保存：" + name);
            } catch (Exception error) {
                showToast("文件保存失败：" + error.getMessage());
            }
        }, "picsew-legacy-export").start();
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }
}
