export function amendmentReplacesCover(currentCoverUrl: string | null, amendmentCoverUrl: string | null) {
  const current = currentCoverUrl?.trim() || null;
  const requested = amendmentCoverUrl?.trim() || null;

  return requested !== null && requested !== current;
}
