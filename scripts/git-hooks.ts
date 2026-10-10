import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function pushedCommits(input: string, head: string): string[] {
  const commits = new Set<string>();

  for (const line of input.trim().split('\n').filter(Boolean)) {
    const parts = line.trim().split(/\s+/);

    if (parts.length !== 4 || !/^[a-f0-9]{40}$/.test(parts[1]) || !/^[a-f0-9]{40}$/.test(parts[3])) {
      throw new Error('Invalid pre-push input; delivery blocked.');
    }
    if (/^0{40}$/.test(parts[1])) continue;
    if (parts[1] !== head) throw new Error('Push only the checked-out HEAD. Check out other branches and verify them separately.');

    commits.add(parts[1]);
  }

  return [...commits];
}

const gatePaths = [
  'supabase/migrations', 'supabase/migration-verification-contract.json', 'scripts/migrations',
  'scripts/verify-supabase-migrations.ts', 'scripts/git-hooks.ts', '.githooks', 'package.json', 'pnpm-lock.yaml',
  'scripts/run-git-hook.ts', 'scripts/install-git-hooks.ts',
  'scripts/tsconfig.migration-gate.json',
];

export function assertCleanGateInputs(root: string) {
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...gatePaths], {
    cwd: root, encoding: 'utf8',
  }).trim();

  if (dirty) throw new Error('Commit migration-gate inputs before pushing. Unrelated worktree changes may remain.');
}

export function previousHook(root: string, name: string): string | undefined {
  let directory: string;

  try {
    directory = execFileSync('git', ['config', '--get', 'ems.previousHooksPath'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }

  const path = resolve(directory, name);
  const current = resolve(root, '.githooks', name);

  if (!existsSync(path)) return undefined;
  if (realpathSync(path) === realpathSync(current)) throw new Error('Recursive hook delegation blocked.');

  return path;
}

export function runHook(name: 'pre-commit' | 'pre-push', args: string[]) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const input = name === 'pre-push' ? readFileSync(0, 'utf8') : '';
  const previous = previousHook(root, name);

  if (previous) execFileSync(previous, args, { cwd: root, input, stdio: ['pipe', 'inherit', 'inherit'] });
  if (name === 'pre-commit') return;

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const commits = pushedCommits(input, head);

  if (commits.length === 0) return;

  assertCleanGateInputs(root);

  for (const commit of commits) {
    execFileSync('pnpm', ['verify:migrations', '--revision', commit], { cwd: root, stdio: 'inherit' });
  }
}
