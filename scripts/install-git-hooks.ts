import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function installHooks(root: string, uninstall = false) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const get = (args: string[]) => {
    try {
      return git(args);
    } catch {
      return undefined;
    }
  };
  const owned = resolve(root, '.githooks');
  const local = get(['config', '--local', '--path', '--get', 'core.hooksPath']);
  const isOwned = local && resolve(root, local) === owned;

  if (uninstall) {
    if (!isOwned) throw new Error('This repository does not own the active hook override.');

    git(['config', '--local', '--unset', 'core.hooksPath']);

    if (get(['config', '--local', '--get', 'ems.previousHooksPath'])) git(['config', '--local', '--unset', 'ems.previousHooksPath']);

    return;
  }
  if (isOwned) return;
  if (local) throw new Error('A repository-local hooksPath already exists; refusing to replace it.');

  const inherited = get(['config', '--path', '--get', 'core.hooksPath']);
  const previous = inherited ? resolve(root, inherited) : resolve(root, git(['rev-parse', '--git-path', 'hooks']));

  if (existsSync(previous)) {
    if (realpathSync(previous) === realpathSync(owned)) throw new Error('Recursive hook path blocked.');

    const unsupported = readdirSync(previous).filter((name) => !name.endsWith('.sample') && !['pre-commit', 'pre-push'].includes(name));

    if (unsupported.length) throw new Error('Other active hooks need explicit integration before installation. Nothing changed.');
  }

  chmodSync(resolve(owned, 'pre-commit'), 0o755);
  chmodSync(resolve(owned, 'pre-push'), 0o755);
  git(['config', '--local', 'ems.previousHooksPath', previous]);
  git(['config', '--local', 'core.hooksPath', owned]);
}

if (process.argv[1]?.endsWith('install-git-hooks.ts')) {
  try {
    const args = process.argv.slice(2);

    if (args.length > 1 || (args.length === 1 && args[0] !== '--uninstall')) throw new Error('Use hooks:install or hooks:uninstall.');

    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

    installHooks(root, args[0] === '--uninstall');
    console.log(args[0] === '--uninstall' ? 'Removed repository hook override; previous hooks remain untouched.' : 'Repository hooks enabled; previous pre-commit/pre-push hooks are preserved.');
  } catch {
    console.error('Hook installation refused. Check existing hooksPath and supported hooks before retrying; existing hook files are never overwritten.');
    process.exitCode = 1;
  }
}
