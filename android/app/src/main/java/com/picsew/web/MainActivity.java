package com.picsew.web;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;
import android.os.Environment;
import java.io.OutputStream;
import android.util.Base64;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void saveBase64File(String base64Data, String mimeType, String filename) {
                try {
                    byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);
                    
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    
                    Uri externalUri = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    Uri downloadUri = getContentResolver().insert(externalUri, values);
                    
                    if (downloadUri != null) {
                        OutputStream os = getContentResolver().openOutputStream(downloadUri);
                        if (os != null) {
                            os.write(decodedBytes);
                            os.close();
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    Toast.makeText(MainActivity.this, "文件已保存至下载目录: " + filename, Toast.LENGTH_LONG).show();
                                }
                            });
                        }
                    } else {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                Toast.makeText(MainActivity.this, "保存文件失败", Toast.LENGTH_SHORT).show();
                            }
                        });
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    final String errMsg = e.getMessage();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "下载失败: " + errMsg, Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }, "AndroidApp");
    }
}
