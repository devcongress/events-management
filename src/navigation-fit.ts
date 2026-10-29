export function fitNavigationLinkCount(
  widths: number[],
  availableWidth: number,
  gap: number,
  moreWidth: number,
): number {
  const fullWidth = widths.reduce((total, width) => total + width, 0)
    + Math.max(0, widths.length - 1) * gap;

  if (fullWidth <= availableWidth + 1) return widths.length;

  let used = moreWidth;
  let count = 0;

  for (const width of widths) {
    if (used + gap + width > availableWidth + 1) break;

    used += gap + width;
    count += 1;
  }

  return count;
}
