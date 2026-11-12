interface NativeResult {
  id: string;
  success: boolean;
  cancelled?: boolean;
  message: string;
}
interface AndroidBridge {
  saveFile?: (base64: string, mime: string, name: string, id: string) => void;
  saveBase64File: (base64: string, mime: string, name: string) => void;
}
export async function downloadBlob(
  blob: Blob,
  mime: string,
  name: string
): Promise<string> {
  const bridge = (window as unknown as { AndroidApp?: AndroidBridge })
    .AndroidApp;
  if (bridge) {
    if (blob.size > 48 * 1024 * 1024)
      throw new Error('文件超过原生保存上限，请降低导出宽度或分段保存');
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('无法读取导出文件'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    if (!bridge.saveFile) {
      bridge.saveBase64File(base64, mime, name);
      return '文件已交给系统保存，请查看系统提示';
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const clear = () => {
        clearTimeout(timer);
        window.removeEventListener('picsew-export-result', onResult);
      };
      const onResult = (event: Event) => {
        const result = (event as CustomEvent<NativeResult>).detail;
        if (
          !result ||
          typeof result !== 'object' ||
          result.id !== id ||
          typeof result.success !== 'boolean' ||
          typeof result.message !== 'string'
        )
          return;
        clear();
        if (result.cancelled)
          reject(new DOMException('已取消保存', 'AbortError'));
        else if (result.success) resolve(result.message);
        else reject(new Error(result.message));
      };
      const timer = setTimeout(() => {
        clear();
        reject(new Error('未收到系统保存结果，请检查文件保存窗口'));
      }, 180000);
      window.addEventListener('picsew-export-result', onResult);
      try {
        bridge.saveFile!(base64, mime, name, id);
      } catch (error) {
        clear();
        reject(error);
      }
    });
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return '已生成文件，请在浏览器下载列表查看';
}
