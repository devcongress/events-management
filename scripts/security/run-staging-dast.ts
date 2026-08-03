import {
  assertSafeStagingTarget,
  createReport,
  printReport,
  runActiveStagingChecks,
  runPassiveDeploymentChecks,
  type SecurityCheck,
} from './deployed-security';

const rawTarget = process.env.STAGING_DAST_URL;
if (!rawTarget) {
  throw new Error('STAGING_DAST_URL is required. No staging target is configured in this repository.');
}

const target = assertSafeStagingTarget(rawTarget, process.env.DAST_CONFIRM_NON_PRODUCTION);
const active = process.env.DAST_ALLOW_ACTIVE === 'true';
const checks: SecurityCheck[] = await runPassiveDeploymentChecks(target);

if (active) {
  checks.push(...await runActiveStagingChecks(target));
} else {
  checks.push({
    id: 'active:disabled',
    status: 'skip',
    detail: 'Mutation-capable staging probes were skipped. Set DAST_ALLOW_ACTIVE=true after confirming isolated staging data.',
  });
}

printReport(createReport(target, 'staging-dast', active, checks));
