type Message = { kind: 'acceptance' | 'rejection' };
type Submission = { id: string; status: string };

export function selectedMessagesAreDirty(messages: Message[], savedMessages: Record<string, string>, submissions: Submission[], selectedIds: string[]): boolean {
  const selected = new Set(selectedIds);
  const kinds = new Set(submissions.filter((item) => selected.has(item.id)).map((item) => item.status === 'selected' ? 'acceptance' : 'rejection'));

  return messages.some((item) => kinds.has(item.kind) && savedMessages[item.kind] !== JSON.stringify(item));
}
