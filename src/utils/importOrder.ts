/** Browsers do not guarantee the order of multi-selected FileList entries. */
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
export function sortScreenshotFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}
