import { readFileSync } from 'node:fs';
import { compileTemplate, parse } from 'vue/compiler-sfc';
import { expect, it } from 'vitest';

it.each(['AdminPresentFormsView', 'AdminFormBoardDisplayView'])('loads %s assets without development module imports', (view) => {
  const filename = `src/views/admin/${view}.vue`;
  const { descriptor } = parse(readFileSync(filename, 'utf8'));
  const result = compileTemplate({
    source: descriptor.template!.content,
    filename,
    id: 'presentation-board',
    transformAssetUrls: { includeAbsolute: true },
  });

  expect(result.errors).toEqual([]);
  expect(result.code).not.toMatch(/import\s+.*from\s+["']\/(?:brand|presentation)\//);
});
