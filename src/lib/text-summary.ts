export function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function wordCount(value: string | null | undefined): number {
  const normalized = compactWhitespace(value ?? '');
  return normalized ? normalized.split(/\s+/).length : 0;
}

export function summarizeText(value: string | null | undefined, wordLimit: number): string {
  const normalized = compactWhitespace(value ?? '');
  if (!normalized) return '';

  const words = normalized.split(/\s+/);
  if (words.length <= wordLimit) {
    return normalized;
  }

  const firstPass = words.slice(0, wordLimit).join(' ');
  const sentenceBoundary = Math.max(
    firstPass.lastIndexOf('. '),
    firstPass.lastIndexOf('? '),
    firstPass.lastIndexOf('! '),
  );

  if (sentenceBoundary > firstPass.length * 0.45) {
    return `${firstPass.slice(0, sentenceBoundary + 1).trim()}...`;
  }

  return `${firstPass.replace(/[,:;-]+$/, '').trim()}...`;
}
