export type TaskDetailsFormat = 'plain_text' | 'rich_text';
export interface TaskDetailsNode {
  type: 'doc' | 'paragraph' | 'text' | 'hardBreak' | 'bulletList' | 'orderedList' | 'listItem';
  text?: string;
  attrs?: { start?: number; type?: null | '1' | 'a' | 'A' | 'i' | 'I' };
  marks?: { type: 'bold' | 'italic' | 'strike' }[];
  content?: TaskDetailsNode[];
}

export const TASK_DETAILS_TEXT_LIMIT = 2000;
export const TASK_DETAILS_STORAGE_LIMIT = 30000;

/** Strict, bounded document validation. No HTML, URLs, styles or arbitrary attributes. */
export function parseTaskDetails(value: string): TaskDetailsNode {
  if (value.length > TASK_DETAILS_STORAGE_LIMIT) throw new Error('Task details are too large.');
  const root: unknown = JSON.parse(value);
  let count = 0;
  function validate(value: unknown, depth: number): asserts value is TaskDetailsNode {
    if (++count > 2500 || depth > 12 || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid task details document.');
    const node = value as Record<string, unknown>;
    if (Object.keys(node).some((key) => !['type', 'text', 'attrs', 'marks', 'content'].includes(key))) throw new Error('Unsupported task formatting.');
    const allowedChildren: Record<string, string[]> = {
      doc: ['paragraph', 'bulletList', 'orderedList'], paragraph: ['text', 'hardBreak'],
      bulletList: ['listItem'], orderedList: ['listItem'], listItem: ['paragraph', 'bulletList', 'orderedList'], text: [], hardBreak: [],
    };
    if (typeof node.type !== 'string' || !Object.hasOwn(allowedChildren, node.type)) throw new Error('Unsupported task formatting.');
    if (node.type === 'text' ? typeof node.text !== 'string' || !node.text.length : node.text !== undefined) throw new Error('Invalid task text.');
    if (node.attrs !== undefined) {
      if (node.type !== 'orderedList' || !node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) throw new Error('Unsupported task attributes.');
      const attrs = node.attrs as Record<string, unknown>;
      if (Object.keys(attrs).some((key) => !['start', 'type'].includes(key)) || !Number.isSafeInteger(attrs.start) || Number(attrs.start) < 1 || Number(attrs.start) > 9999 || (attrs.type !== undefined && attrs.type !== null && !['1', 'a', 'A', 'i', 'I'].includes(String(attrs.type)))) throw new Error('Invalid list numbering.');
    }
    if (node.marks !== undefined && (!['text', 'hardBreak'].includes(node.type) || !Array.isArray(node.marks) || node.marks.length > 3 || node.marks.some((mark) => !mark || typeof mark !== 'object' || Object.keys(mark).length !== 1 || !['bold', 'italic', 'strike'].includes(mark.type)))) throw new Error('Unsupported task formatting.');
    if (node.content !== undefined && !Array.isArray(node.content)) throw new Error('Invalid task details content.');
    const children = (node.content ?? []) as unknown[];
    for (const child of children) {
      validate(child, depth + 1);
      if (!allowedChildren[node.type].includes(child.type)) throw new Error('Invalid task details structure.');
    }
    if (['doc', 'bulletList', 'orderedList', 'listItem'].includes(node.type) && !children.length) throw new Error('Invalid empty task structure.');
    if (node.type === 'listItem' && (children[0] as TaskDetailsNode).type !== 'paragraph') throw new Error('Lists must start with a paragraph.');
  }
  validate(root, 0);
  if (root.type !== 'doc') throw new Error('Invalid task details document.');
  if (taskDetailsText(root).length > TASK_DETAILS_TEXT_LIMIT) throw new Error('Keep task details within 2,000 characters.');
  return root;
}

export function taskDetailsText(node: TaskDetailsNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(taskDetailsText).join(node.type === 'paragraph' ? '' : '\n');
}

export function taskDetailsDocument(value: string | null | undefined, format?: TaskDetailsFormat): TaskDetailsNode {
  if (value && format === 'rich_text') return parseTaskDetails(value);
  return { type: 'doc', content: (value ?? '').split(/\r?\n/).map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) };
}

export function taskDetailsSearchText(value: string | null | undefined, format?: TaskDetailsFormat): string {
  try { return taskDetailsText(taskDetailsDocument(value, format)); } catch { return ''; }
}

export function validateTaskDetailsInput(value: { details?: string | null; details_format?: TaskDetailsFormat }): boolean {
  if (value.details === undefined) return value.details_format === undefined;
  if (value.details === null) return true;
  if (value.details_format !== 'rich_text') return value.details.length <= TASK_DETAILS_TEXT_LIMIT;
  try { parseTaskDetails(value.details); return true; } catch { return false; }
}
