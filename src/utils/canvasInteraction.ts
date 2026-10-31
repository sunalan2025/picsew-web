/**
 * The canvas is read-only until the user explicitly opens an editing tool.
 * Prevents accidental drag-to-crop when scrolling long screenshots on mobile.
 */
export function canInteractWithCanvas(activeTab: string): boolean {
  return activeTab === 'stitch' || activeTab === 'cut' || activeTab === 'markup';
}
