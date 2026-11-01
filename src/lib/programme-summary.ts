/** Create a reviewable extract without sending proposal text to another service. */
export function suggestProgrammeSummary(description: string): string {
  const text = description.replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!text) return '';
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()) ?? [text];
  const target = Math.min(300, Math.max(80, Math.floor(text.length * 0.6)));
  const selected: string[] = [];

  for (const sentence of sentences) {
    if (selected.length && selected.join(' ').length + sentence.length + 1 > target) break;
    selected.push(sentence);
    if (selected.join(' ').length >= target) break;
  }
  const result = selected.join(' ');

  if (result.length <= target || text.length <= 80) return result;
  const clause = result.slice(0, target).search(/[,;:](?=[^,;:]*$)/);
  const boundary = clause >= 45 ? clause : result.lastIndexOf(' ', target);

  return `${result.slice(0, boundary > 40 ? boundary : target).trim()}…`;
}
