/** Up to five page numbers centred on the current page. */
export function pageWindow(current: number, total: number): number[] {
  const size = Math.min(5, total);
  const start = Math.max(1, Math.min(current - 2, total - size + 1));
  return Array.from({ length: size }, (_, i) => start + i);
}
