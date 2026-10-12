import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const zeroSha = '0'.repeat(40);

type PushUpdate = {
  local: string;
  localSha: string;
  remote: string;
  remoteSha: string;
};

export function pushedUpdates(input: string, head: string): PushUpdate[] {
  const updates: PushUpdate[] = [];

  for (const line of input.trim().split('\n').filter(Boolean)) {
    const [local, localSha, remote, remoteSha, ...extra] = line.trim().split(/\s+/);

    if (extra.length > 0 || !local || !remote || !/^[a-f0-9]{40}$/.test(localSha) || !/^[a-f0-9]{40}$/.test(remoteSha)) {
      throw new Error('Invalid pre-push input; delivery blocked.');
    }
    if (localSha === zeroSha) continue;
    if (localSha !== head) throw new Error('Push only the checked-out HEAD. Check out other branches and verify them separately.');

    updates.push({ local, localSha, remote, remoteSha });
  }

  return updates;
}

export function pushedCommits(input: string, head: string): string[] {
  return [...new Set(pushedUpdates(input, head).map(({ localSha }) => localSha))];
}

export const journeySensitiveInputPaths = [
  'src',
  'server/routes',
  'lib',
  'types',
  'scripts/organizer-journeys.mjs',
  'vite.config.ts',
  'tailwind.config.ts',
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
];

export function hasJourneySensitiveChanges(paths: string[]): boolean {
  return paths.some((path) => journeySensitiveInputPaths.some((input) => path === input || path.startsWith(`${input}/`)));
}

function commandOutput(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function changedPathsFromNewRemoteRef(root: string, localSha: string, remoteName: string): string[] {
  const commits = commandOutput(root, ['rev-list', localSha, '--not', `--remotes=${remoteName}`])
    .split('\n')
    .filter(Boolean);

  if (commits.length === 0) return [];

  return commits.flatMap((commit) =>
    commandOutput(root, ['diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', commit])
      .split('\n')
      .filter(Boolean),
  );
}

export function changedPathsForPush(root: string, updates: PushUpdate[], remoteName: string): string[] {
  const paths = new Set<string>();

  for (const update of updates) {
    let changed: string[];

    if (update.remoteSha === zeroSha) {
      changed = changedPathsFromNewRemoteRef(root, update.localSha, remoteName);
    } else {
      try {
        commandOutput(root, ['cat-file', '-e', `${update.remoteSha}^{commit}`]);
      } catch {
        throw new Error(`Cannot inspect the remote ref for ${update.remote}. Fetch ${remoteName} and retry the push.`);
      }

      changed = commandOutput(root, ['diff', '--name-only', '--no-renames', update.remoteSha, update.localSha, '--'])
        .split('\n')
        .filter(Boolean);
    }

    changed.forEach((path) => paths.add(path));
  }

  return [...paths];
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

export function assertCleanJourneyInputs(root: string) {
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...journeySensitiveInputPaths], {
    cwd: root, encoding: 'utf8',
  }).trim();

  if (dirty) throw new Error('Commit journey-test inputs before pushing. Unrelated worktree changes may remain.');
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
  const updates = pushedUpdates(input, head);
  const commits = [...new Set(updates.map(({ localSha }) => localSha))];

  if (commits.length === 0) return;

  assertCleanGateInputs(root);

  const changedPaths = changedPathsForPush(root, updates, args[0] ?? 'origin');

  if (hasJourneySensitiveChanges(changedPaths)) {
    assertCleanJourneyInputs(root);
    execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
    execFileSync('pnpm', ['test:journeys'], { cwd: root, stdio: 'inherit' });
  }

  for (const commit of commits) {
    execFileSync('pnpm', ['verify:migrations', '--revision', commit], { cwd: root, stdio: 'inherit' });
  }
}
