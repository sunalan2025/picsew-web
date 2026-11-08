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
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;

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
    private String pendingLegacyRequestId;
    private final ArrayList<Uri> sharedImages = new ArrayList<>();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        captureSharedIntent(getIntent());
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String listSharedImages() {
                JSONArray result = new JSONArray();
                synchronized (sharedImages) {
                    for (int i = 0; i < sharedImages.size(); i++) {
                        try {
                            JSONObject file = new JSONObject(); file.put("index", i);
                            file.put("mime", getContentResolver().getType(sharedImages.get(i)));
                            result.put(file);
                        } catch (Exception ignored) { }
                    }
                }
                return result.toString();
            }
            @JavascriptInterface
            public String readSharedImage(int index) {
                final Uri uri;
                synchronized (sharedImages) {
                    if (index < 0 || index >= sharedImages.size()) return "";
                    uri = sharedImages.get(index);
                }
                try (InputStream input = getContentResolver().openInputStream(uri);
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input == null) return "";
                    byte[] buffer = new byte[16384]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (output.size() + count > 20 * 1024 * 1024) return "";
                        output.write(buffer, 0, count);
                    }
                    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                } catch (Exception error) { return ""; }
            }
            @JavascriptInterface
            public void finishSharedImport() { synchronized (sharedImages) { sharedImages.clear(); } }

            @JavascriptInterface
            public void saveBase64File(String base64Data, String mimeType, String filename) {
                saveFile(base64Data, mimeType, filename, "");
            }
            @JavascriptInterface
            public void saveFile(String base64Data, String mimeType, String filename, String requestId) {
                final String name = sanitizeFilename(filename);
                final String mime = allowedMime(mimeType);
                if (base64Data == null || base64Data.isEmpty() ||
                        base64Data.length() > MAX_ENCODED_LENGTH ||
                        (base64Data.length() % 4 != 0)) {
                    reportExport(requestId, false, false, "文件无效或过大，请尝试降低导出画质");
                    return;
                }
                if (mime == null) {
                    reportExport(requestId, false, false, "不支持的导出格式");
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    new Thread(() -> saveWithMediaStore(base64Data, mime, name, requestId),
                            "picsew-export").start();
                } else {
                    runOnUiThread(() -> openLegacyDocumentPicker(base64Data, mime, name, requestId));
                }
            }
        }, "AndroidApp");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent); captureSharedIntent(intent);
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('picsew-share-ready'));", null));
    }

    @SuppressWarnings("deprecation")
    private void captureSharedIntent(Intent intent) {
        if (intent == null || intent.getType() == null || !intent.getType().startsWith("image/")) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM); if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> received = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (received != null) uris.addAll(received);
        }
        synchronized (sharedImages) {
            for (Uri uri : uris) {
                if (uri == null) continue;
                if (sharedImages.size() >= 10) break;
                try {
                    String mime = getContentResolver().getType(uri);
                    if ("content".equals(uri.getScheme()) && mime != null && mime.startsWith("image/")) sharedImages.add(uri);
                } catch (SecurityException ignored) { /* ignore inaccessible share attachments */ }
            }
        }
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

    private void saveWithMediaStore(String base64, String mime, String name, String requestId) {
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
            reportExport(requestId, true, false, "已保存到下载目录：" + name);
        } catch (Exception error) {
            if (uri != null) {
                try { getContentResolver().delete(uri, null, null); }
                catch (Exception ignored) { /* cleanup is best-effort */ }
            }
            reportExport(requestId, false, false, "文件保存失败：" + error.getMessage());
        }
    }

    private void openLegacyDocumentPicker(String base64, String mime, String name, String requestId) {
        if (pendingLegacyBase64 != null) {
            reportExport(requestId, false, false, "请先完成上一个文件的保存");
            return;
        }
        pendingLegacyBase64 = base64;
        pendingLegacyName = name;
        pendingLegacyRequestId = requestId;
        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(intent, CREATE_DOCUMENT_REQUEST);
        } catch (Exception error) {
            pendingLegacyBase64 = null;
            pendingLegacyName = null;
            pendingLegacyRequestId = null;
            reportExport(requestId, false, false, "无法打开保存窗口：" + error.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CREATE_DOCUMENT_REQUEST) return;
        String encoded = pendingLegacyBase64;
        String name = pendingLegacyName;
        String requestId = pendingLegacyRequestId;
        pendingLegacyRequestId = null;
        pendingLegacyBase64 = null;
        pendingLegacyName = null;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            reportExport(requestId, false, true, "已取消保存");
            return;
        }
        if (encoded == null) return;
        Uri destination = data.getData();
        new Thread(() -> {
            try (OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                if (out == null) throw new IOException("无法写入选中的位置");
                writeDecodedBase64(encoded, out);
                reportExport(requestId, true, false, "已保存：" + name);
            } catch (Exception error) {
                reportExport(requestId, false, false, "文件保存失败：" + error.getMessage());
            }
        }, "picsew-legacy-export").start();
    }

    private void reportExport(String id, boolean success, boolean cancelled, String message) {
        showToast(message);
        if (id == null || id.isEmpty()) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("id", id); detail.put("success", success); detail.put("cancelled", cancelled); detail.put("message", message);
            String script = "window.dispatchEvent(new CustomEvent('picsew-export-result',{detail:" + detail.toString() + "}));";
            runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(script, null));
        } catch (Exception ignored) { /* toast remains available if WebView was closed */ }
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }
}
