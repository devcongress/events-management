import { runHook } from './git-hooks';

const name = process.argv[2];

try {
  if (name !== 'pre-commit' && name !== 'pre-push') throw new Error('Unknown hook.');

  runHook(name, process.argv.slice(3));
} catch {
  console.error('Git hook blocked this operation. For pushes, commit gate inputs, push the checked-out HEAD, and run pnpm verify:migrations to diagnose. Existing identity-hook failures are also preserved.');
  process.exitCode = 1;
}
