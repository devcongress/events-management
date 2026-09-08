import { describe, expect, it } from 'vitest';
import { parseTaskDetails, taskDetailsDocument, taskDetailsText, taskDetailsSearchText, validateTaskDetailsInput } from './annual-conference-task-details';

describe('work-plan task details', () => {
  it('searches visible phrases across formatting boundaries, not JSON syntax', () => {
    const details = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'speaker', marks: [{ type: 'bold' }] }, { type: 'text', text: ' flyer' }] }] });
    expect(taskDetailsSearchText(details, 'rich_text')).toBe('speaker flyer');
    expect(taskDetailsSearchText('bad json', 'rich_text')).toBe('');
  });
  it('preserves literal legacy text, blank lines and HTML-looking text', () => {
    const text = 'First line\n\n1. Next line\n<strong>Literal</strong>';
    expect(taskDetailsText(taskDetailsDocument(text))).toBe(text);
  });
  it('accepts editor JSON with lists and supported marks', () => {
    const doc = { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done', marks: [{ type: 'bold' }, { type: 'strike' }] }] }] }] }] };
    expect(parseTaskDetails(JSON.stringify(doc))).toEqual(doc);
  });
  it('accepts a soft line break inside formatted text', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }, { type: 'hardBreak', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Second' }] }] };
    expect(taskDetailsText(parseTaskDetails(JSON.stringify(doc)))).toBe('First\nSecond');
  });
  it.each(['image', 'script', 'iframe', 'link', '__proto__'])('rejects unsupported nodes: %s', (type) => {
    expect(() => parseTaskDetails(JSON.stringify({ type: 'doc', content: [{ type }] }))).toThrow();
  });
  it('rejects injected marks and arbitrary attributes', () => {
    const document = taskDetailsDocument('text');
    const invalid = { ...document, attrs: { onclick: 'alert(1)' } };
    expect(() => parseTaskDetails(JSON.stringify(invalid))).toThrow();
    expect(() => parseTaskDetails(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }))).toThrow();
  });
  it('keeps the plain and rich text limits at 2000, independently of JSON overhead', () => {
    expect(validateTaskDetailsInput({ details: 'x'.repeat(2000) })).toBe(true);
    expect(validateTaskDetailsInput({ details: 'x'.repeat(2001) })).toBe(false);
    expect(validateTaskDetailsInput({ details: JSON.stringify(taskDetailsDocument('x'.repeat(2000))), details_format: 'rich_text' })).toBe(true);
    expect(validateTaskDetailsInput({ details: JSON.stringify(taskDetailsDocument('x'.repeat(2001))), details_format: 'rich_text' })).toBe(false);
  });
  it('rejects format-only updates and malformed rich text but allows status-only and clearing', () => {
    expect(validateTaskDetailsInput({})).toBe(true);
    expect(validateTaskDetailsInput({ details_format: 'rich_text' })).toBe(false);
    expect(validateTaskDetailsInput({ details: 'not json', details_format: 'rich_text' })).toBe(false);
    expect(validateTaskDetailsInput({ details: null, details_format: 'rich_text' })).toBe(true);
  });
});
