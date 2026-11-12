export type ImportSkips = {
  limit: number;
  format: number;
  size: number;
  pixels: number;
  failed: number;
};
export function importFeedback(loaded: number, skipped: ImportSkips): string {
  const details: string[] = [];
  if (skipped.limit)
    details.push(
      `${skipped.limit} 张超过数量上限，请移除部分图片后分批添加（最多 50 张）`
    );
  if (skipped.format)
    details.push(
      `${skipped.format} 张格式不支持，请在相册中另存为 PNG 或 JPEG 后添加`
    );
  if (skipped.size)
    details.push(
      `${skipped.size} 张文件太大，请缩小图片或降低画质后重试（单张最多 50 MB）`
    );
  if (skipped.pixels)
    details.push(`${skipped.pixels} 张尺寸过大，请缩小截图或分批拼接后重试`);
  if (skipped.failed)
    details.push(`${skipped.failed} 张无法读取，请重新选择相册中的原始截图`);
  return `${loaded ? `已添加 ${loaded} 张截图，系统会自动拼接。` : '没有添加成功。'}${details.join('；')}${details.length ? '。' : ''}`;
}
/** Decode only supported raster images, regardless of a misleading file extension. */
export function supportedRasterHeader(
  bytes: Uint8Array,
  mime: string
): boolean {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  const detected =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value
    )
      ? 'image/png'
      : bytes.length >= 3 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255
        ? 'image/jpeg'
        : bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP'
          ? 'image/webp'
          : ['GIF87a', 'GIF89a'].includes(text(0, 6))
            ? 'image/gif'
            : null;
  return (
    detected !== null &&
    (!mime ||
      detected === mime ||
      (detected === 'image/jpeg' && mime === 'image/jpg'))
  );
}
