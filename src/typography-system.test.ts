import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKSPACE_ROOT = process.cwd();
const SOURCE_ROOT = join(WORKSPACE_ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.css', '.ts', '.vue']);
const SUPPORTED_WEIGHTS = new Set([400, 500, 600, 700, 800]);
const SHARED_SYSTEM_FILES = [
  join(WORKSPACE_ROOT, 'lib', 'app-boot.ts'),
  join(WORKSPACE_ROOT, 'lib', 'design-system.ts'),
  join(WORKSPACE_ROOT, 'tailwind.config.ts'),
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!SOURCE_EXTENSIONS.has(extname(entry.name)) || entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

describe('typography system', () => {
  it('keeps source typography inside the supported semantic weight scale', () => {
    const unsupportedClass = new RegExp(`font-${'black'}`);
    const syntheticMonoDisplay = /(?:font-mono.*font-extrabold|font-extrabold.*font-mono)/;
    const offenders = [...sourceFiles(SOURCE_ROOT), ...SHARED_SYSTEM_FILES].flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return source.split('\n').flatMap((line, index) => {
        const numericWeight = line.match(/font-weight:\s*(\d+)\b/);
        const unsupportedNumericWeight = (
          numericWeight
          && !SUPPORTED_WEIGHTS.has(Number(numericWeight[1]))
        );
        return (
          unsupportedClass.test(line)
          || unsupportedNumericWeight
          || syntheticMonoDisplay.test(line)
            ? [`${path}:${index + 1}`]
            : []
        );
      });
    });

    expect(offenders).toEqual([]);
  });

  it('defines the shared body-to-display hierarchy and does not load Inter 900', () => {
    const styles = readFileSync(join(SOURCE_ROOT, 'styles.css'), 'utf8');
    const entry = readFileSync(join(SOURCE_ROOT, 'main.ts'), 'utf8');
    const tailwind = readFileSync(join(WORKSPACE_ROOT, 'tailwind.config.ts'), 'utf8');
    const designSystem = readFileSync(join(WORKSPACE_ROOT, 'lib', 'design-system.ts'), 'utf8');

    expect(styles).toContain('--font-weight-body: 400');
    expect(styles).toContain('--font-weight-emphasis: 500');
    expect(styles).toContain('--font-weight-label: 600');
    expect(styles).toContain('--font-weight-heading: 700');
    expect(styles).toContain('--font-weight-display: 800');
    expect(tailwind).toContain("extrabold: 'var(--font-weight-display)'");
    expect(designSystem).toContain('display: 800');
    expect(entry).not.toContain('@fontsource/inter/latin-900.css');
  });
});
