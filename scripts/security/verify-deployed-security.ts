import {
  createReport,
  deployedTarget,
  printReport,
  runPassiveDeploymentChecks,
} from './deployed-security';

const target = deployedTarget(process.env.DEPLOYED_BASE_URL ?? 'https://em.devcongress.org');
const expectedAppOrigin = new URL(process.env.DEPLOYED_EXPECTED_APP_ORIGIN ?? target.origin).origin;
const checks = await runPassiveDeploymentChecks(target, expectedAppOrigin);
printReport(createReport(target, 'deployed-verification', false, checks));
