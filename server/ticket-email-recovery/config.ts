export type RecoveryConfig = {
  databaseUrl: string;
  senderEnv: Record<string, string>;
};

export function readRecoveryConfig(env: Record<string, string | undefined>): RecoveryConfig {
  const required = (key: string) => {
    const value = env[key]?.trim();

    if (!value) throw new Error(`Missing required runner configuration: ${key}`);

    return value;
  };

  if (required('ADMISSION_RECOVERY_RUNNER_ENABLED') !== 'true' || required('ADMISSION_RECOVERY_OWNER') !== 'postgres') {
    throw new Error('Runner requires explicit postgres ownership and enablement.');
  }
  const databaseUrl = required('ADMISSION_RECOVERY_DATABASE_URL');
  const expectedHost = required('ADMISSION_RECOVERY_EXPECTED_HOST').toLowerCase();
  const expectedRef = required('ADMISSION_RECOVERY_EXPECTED_PROJECT_REF').toLowerCase();
  const url = new URL(databaseUrl);
  const username = decodeURIComponent(url.username).toLowerCase();
  const role = (env.ADMISSION_RECOVERY_DATABASE_ROLE?.trim() || 'postgres').toLowerCase();

  if (!/^[a-z_][a-z0-9_]*$/.test(role) || !/^[a-z0-9]+$/.test(expectedRef) || !['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname.toLowerCase() !== expectedHost
    || !((url.hostname.toLowerCase() === `db.${expectedRef}.supabase.co` && username === role)
      || (url.hostname.toLowerCase().endsWith('.pooler.supabase.com') && username === `${role}.${expectedRef}`))
    || (url.port !== '' && url.port !== '5432')
    || url.searchParams.get('sslmode') !== 'require'
    || [...url.searchParams.keys()].some(key => key !== 'sslmode')) {
    throw new Error('Database endpoint does not match the expected Supabase project and TLS configuration.');
  }
  const senderEnv: Record<string, string> = { NODE_ENV: 'production' };

  for (const key of ['DEVCON26_ADMISSION_EMAILS_ENABLED', 'RESEND_API_KEY', 'DEVCON26_ADMISSION_EMAIL_FROM', 'DEVCON26_ADMISSION_EMAIL_REPLY_TO', 'PUBLIC_WEBSITE_ORIGIN']) {
    senderEnv[key] = required(key);
  }
  if (senderEnv.DEVCON26_ADMISSION_EMAILS_ENABLED !== 'true') throw new Error('Admission delivery must be explicitly enabled.');
  for (const key of ['PAYSTACK_SECRET_KEY', 'PAYSTACK_TEST_SECRET_KEY']) senderEnv[key] = env[key]?.trim() ?? '';

  return { databaseUrl, senderEnv };
}
