import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
type TemplateChildNode = NonNullable<NonNullable<ReturnType<typeof parse>['descriptor']['template']>['ast']>['children'][number];

describe('shared form control coverage', () => {
  it('gives standard native fields a shared style while preserving specialized controls', () => {
    const uncovered: string[] = [];
    for (const file of fs.readdirSync('src', { recursive: true }).filter(name => String(name).endsWith('.vue'))) {
      const filename = String(file);
      const ast = parse(fs.readFileSync(path.join('src', filename), 'utf8')).descriptor.template?.ast;
      function visit(node: TemplateChildNode, composite = false) {
        if (node.type !== 1) return;
        const attrs = node.props.map(prop => prop.loc.source).join(' ');
        const nestedComposite = composite || attrs.includes('quiz-option-input');
        if (['input', 'textarea', 'select'].includes(node.tag)) {
          const specialized = /type="(?:file|checkbox|radio|hidden|search)"|inputmode="search"|event-outline-input|mobile-event-blast-(?:safe|reserve)/.test(attrs)
            || filename.endsWith('AppDatePicker.vue') || filename.endsWith('PlayCodeView.vue') || nestedComposite;
          if (!specialized && !/editorial-input|app-form-control/.test(attrs)) uncovered.push(`${filename}:${node.loc.start.line}`);
        }
        node.children.forEach(child => visit(child, nestedComposite));
      }
      ast?.children.forEach(node => visit(node));
    }
    expect(uncovered).toEqual([]);
  });

  it('loads one shared stylesheet and preserves reduced-motion support', () => {
    expect(fs.readFileSync('src/main.ts', 'utf8')).toContain("import './styles/forms.css'");
    const styles = fs.readFileSync('src/styles/forms.css', 'utf8');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).not.toContain('transition: all');
    expect(styles).toMatch(/textarea:is\(\.editorial-input, \.app-form-control\)\s*\{\s*resize: none;\s*overflow-y: auto;/);
    expect(fs.readFileSync('src/views/admin/AdminMobileEventBlastsView.vue', 'utf8')).not.toContain('resize: vertical');
  });
});
