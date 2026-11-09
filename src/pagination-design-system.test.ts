import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

type TemplateNode = NonNullable<NonNullable<ReturnType<typeof parse>['descriptor']['template']>['ast']>['children'][number];

function findCustomPagination(source: string): number[] {
  const ast = parse(source).descriptor.template?.ast;
  const findings: number[] = [];

  function visibleText(node: TemplateNode): string {
    if (node.type === 2) return node.content;
    if (node.type !== 1) return '';

    return node.children.map(visibleText).join(' ');
  }

  function visit(node: TemplateNode, inPagination = false): void {
    if (node.type !== 1) return;
    const attributes = node.props.map(prop => prop.loc.source).join(' ');
    const pageLabel = node.children.some(child => child.type === 1 && /^\s*page\s*$/i.test(visibleText(child)) && child.loc.source.includes('{{'));
    const paginationContext = inPagination || /aria-label=["'][^"']*(?:pagination|\bpages\b)/i.test(attributes) || pageLabel;

    if (node.tag === 'button' || node.tag === 'a') {
      const label = visibleText(node).trim();
      const direction = /^(?:previous|next)(?:\s+page)?$/i.test(label) || /aria-label=["'](?:previous|next)(?:\s+\w+)*\s+page["']/i.test(attributes);
      const pageHandler = /(?:@click|v-on:click|:href|href)=["'][^"']*\bpage\w*/i.test(attributes);

      if (direction && (paginationContext || pageHandler || /aria-label=["'](?:previous|next)(?:\s+\w+)*\s+page["']/i.test(attributes))) findings.push(node.loc.start.line);
    }
    node.children.forEach(child => visit(child, paginationContext));
  }
  ast?.children.forEach(node => visit(node));

  return findings;
}

describe('shared pagination coverage', () => {
  it('identifies pagination buttons and links, including nested text', () => {
    expect(findCustomPagination('<template><nav aria-label="Search pagination"><a href="?page=2"><span>Next</span></a></nav></template>')).toHaveLength(1);
    expect(findCustomPagination('<template><div><span>Page {{ page }} of {{ pages }}</span><button @click="page++"><span>Next</span></button></div></template>')).toHaveLength(1);
    expect(findCustomPagination('<template><button aria-label="Previous checkout page" /></template>')).toHaveLength(1);
  });

  it('does not treat wizard or calendar navigation as pagination', () => {
    expect(findCustomPagination('<template><div><button @click="nextStep">Next</button><button aria-label="Previous month">Previous</button></div></template>')).toEqual([]);
  });

  it('uses AppPagination for active Vue page navigation', () => {
    const customControls: string[] = [];

    for (const file of fs.readdirSync('src', { recursive: true }).filter(name => String(name).endsWith('.vue'))) {
      const filename = String(file);

      if (filename.endsWith('AppPagination.vue')) continue;
      const source = fs.readFileSync(path.join('src', filename), 'utf8');

      for (const line of findCustomPagination(source)) customControls.push(`${filename}:${line}`);
    }
    expect(customControls).toEqual([]);
  });
});
