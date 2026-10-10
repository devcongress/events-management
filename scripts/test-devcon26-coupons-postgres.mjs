import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Never accepts a database URL: every run owns an isolated, socket-only cluster.
const run = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bindir = process.env.DEVCON26_TEST_POSTGRES_BIN
  || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const taskDirectory = mkdtempSync(join(tmpdir(), 'devcon26-coupon-regression-'));
const dataDirectory = join(taskDirectory, 'data');
const postgresLog = join(taskDirectory, 'postgres.log');
const connectionArgs = ['-h', taskDirectory, '-p', '55472', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
let started = false;
let checks = 0;

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function sql(statement) {
  const { stdout } = await run(join(bindir, 'psql'), [...connectionArgs, '-c', statement]);

  return stdout.trim();
}

async function json(statement) {
  return JSON.parse(await sql(`set role service_role; ${statement}`));
}

async function expectFailure(statement, pattern) {
  await assert.rejects(() => sql(statement), pattern);
  checks += 1;
}

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

async function createCoupon(code, overrides = {}) {
  const values = {
    type: 'fixed_minor', value: 1000, tiers: ['regular', 'team_3', 'team_5'],
    expiry: "now() + interval '1 day'", maximum: 5, ...overrides,
  };
  const tierArray = `array[${values.tiers.map(literal).join(',')}]::text[]`;

  return json(`select row_to_json(public.create_devcon26_test_coupon(
    2026, ${literal(code)}, ${literal(values.type)}, ${values.value}, ${tierArray},
    ${values.expiry}, ${values.maximum}, 'owner@example.invalid'
  ));`);
}

function prepareStatement(key, code, overrides = {}) {
  const values = { tier: 'regular', name: 'Coupon Buyer', email: 'buyer@example.invalid', ...overrides };

  return `select row_to_json(public.prepare_devcon26_test_checkout(
    ${literal(key)}::uuid, ${literal(values.tier)}, ${literal(values.name)},
    ${literal(values.email)}, ${code === null ? 'null' : literal(code)}
  ));`;
}

async function prepare(code, overrides = {}) {
  return json(prepareStatement(randomUUID(), code, overrides));
}

async function confirm(session, overrides = {}) {
  const values = {
    event: `event-${randomUUID()}`, amount: session.amount_minor, currency: 'GHS',
    domain: 'test', status: 'success', hash: 'a'.repeat(64), ...overrides,
  };

  return json(`select row_to_json(public.confirm_devcon26_test_checkout(
    ${literal(session.payment_reference)}, ${literal(values.event)}, ${values.amount},
    ${literal(values.currency)}, ${literal(values.domain)}, ${literal(values.status)},
    ${literal(values.hash)}
  ));`);
}

async function expireHold(session) {
  await sql(`update public.devcon26_test_coupon_claims
    set expires_at = now() - interval '1 minute' where session_id = ${literal(session.id)}::uuid;`);
}

async function claimStatus(session) {
  return sql(`select status from public.devcon26_test_coupon_claims
    where session_id = ${literal(session.id)}::uuid;`);
}

try {
  await run(join(bindir, 'initdb'), ['-D', dataDirectory, '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  await run(join(bindir, 'pg_ctl'), [
    '-D', dataDirectory, '-l', postgresLog, '-o',
    `-k ${taskDirectory} -p 55472 -c listen_addresses=''`, 'start',
  ]);
  started = true;
  // Supabase's trusted server role bypasses RLS; public roles must not.
  await sql('create role anon; create role authenticated; create role service_role bypassrls;');

  for (const migration of [
    '20261007050000_devcon26_test_checkout.sql',
    '20261010120000_devcon26_test_checkout_coupons.sql',
  ]) {
    await run(join(bindir, 'psql'), [...connectionArgs, '-f', join(repo, 'supabase', 'migrations', migration)]);

    if (migration === '20261007050000_devcon26_test_checkout.sql') {
      await sql(`insert into public.devcon26_test_checkout_sessions
        (checkout_request_key, tier_key, quantity, amount_minor, payment_reference, status)
        values (${literal(randomUUID())}::uuid, 'regular', 1, 19999, 'legacy-payment', 'verified');`);
    }
  }

  const legacy = await json("select row_to_json(s) from public.devcon26_test_checkout_sessions s where payment_reference = 'legacy-payment';");

  check(legacy.base_amount_minor === 19999 && legacy.discount_amount_minor === 0
    && legacy.status === 'verified', 'The forward migration preserves existing payment records.');

  await createCoupon('FIXED');

  const quoted = await json("select public.quote_devcon26_test_checkout('team_3', ' fixed ');");

  check(quoted.base_amount_minor === 54999 && quoted.discount_amount_minor === 1000
    && quoted.final_amount_minor === 53999, 'Fixed discount applies to the complete bundle.');
  check(await sql('select count(*) from public.devcon26_test_coupon_claims;') === '0', 'Quoting must not reserve a redemption.');

  await createCoupon('PERCENT', { type: 'percentage_bps', value: 1250 });

  const percentage = await json("select public.quote_devcon26_test_checkout('team_5', 'PERCENT');");

  check(percentage.discount_amount_minor === 10624 && percentage.final_amount_minor === 74375,
    'Percentage uses integer pesewas and floors the discount.');
  await assert.rejects(() => createCoupon('FREE', { value: 19999 }), /check constraint/i);
  checks += 1;
  await createCoupon('SOLO', { tiers: ['regular'] });
  await expectFailure("select public.quote_devcon26_test_checkout('team_3', 'SOLO');", /coupon|tier/i);
  await expectFailure("select public.quote_devcon26_test_checkout('regular', 'MISSING');", /coupon/i);

  const disabled = await createCoupon('DISABLED');

  await sql(`select public.toggle_devcon26_test_coupon(${literal(disabled.id)}::uuid, false, 'owner@example.invalid');`);
  await expectFailure("select public.quote_devcon26_test_checkout('regular', 'DISABLED');", /coupon/i);
  await createCoupon('EXPIRED', { expiry: "now() + interval '1 second'" });
  await sql('select pg_sleep(1.1);');
  await expectFailure("select public.quote_devcon26_test_checkout('regular', 'EXPIRED');", /coupon/i);

  const maximumOne = await createCoupon('RACE', { maximum: 1 });
  const attempts = await Promise.allSettled([
    sql(`set role service_role; begin; ${prepareStatement(randomUUID(), 'RACE')} select pg_sleep(0.2); commit;`),
    sql(`set role service_role; begin; ${prepareStatement(randomUUID(), 'RACE')} select pg_sleep(0.2); commit;`),
  ]);

  check(attempts.filter((result) => result.status === 'fulfilled').length === 1,
    'Concurrent initializations must yield exactly one reservation for a max-one code.');
  check(await sql(`select count(*) from public.devcon26_test_coupon_claims
    where coupon_id = ${literal(maximumOne.id)}::uuid and status = 'held' and expires_at > now();`) === '1',
  'No oversubscribed active holds.');

  const replayKey = randomUUID();
  const initial = await json(prepareStatement(replayKey, 'FIXED'));

  await sql(`update public.devcon26_test_checkout_sessions set authorization_url = 'https://checkout.paystack.com/example'
    where id = ${literal(initial.id)}::uuid;`);

  const replayed = await json(prepareStatement(replayKey, ' fixed ', { email: 'BUYER@example.invalid' }));

  check(replayed.id === initial.id, 'Exact normalized retry reuses the session.');
  await expectFailure(prepareStatement(replayKey, 'FIXED', { email: 'other@example.invalid' }), /conflict/i);
  await expectFailure(prepareStatement(replayKey, 'FIXED', { tier: 'team_3' }), /conflict/i);
  await expectFailure(prepareStatement(replayKey, 'PERCENT'), /conflict/i);
  await expectFailure(prepareStatement(replayKey, 'FIXED', { name: 'Other Buyer' }), /conflict/i);

  await createCoupon('EXPIRE-HOLD', { maximum: 1 });

  const abandoned = await prepare('EXPIRE-HOLD');

  await expireHold(abandoned);

  const replacement = await prepare('EXPIRE-HOLD');

  check(replacement.id !== abandoned.id, 'An expired hold must free allowance without a scheduler.');

  await createCoupon('FAILURE', { maximum: 1 });

  const failed = await prepare('FAILURE');
  const rejected = await confirm(failed, { status: 'failed' });

  check(rejected.status === 'rejected' && await claimStatus(failed) === 'released', 'Trusted failure releases its hold.');
  check(Boolean((await prepare('FAILURE')).id), 'Failure must not consume completed allowance.');

  await createCoupon('SUCCESS', { maximum: 1 });

  const success = await prepare('SUCCESS');
  const providerEvent = `event-${randomUUID()}`;
  const verified = await confirm(success, { event: providerEvent });
  const repeated = await confirm(success, { event: providerEvent });

  check(verified.status === 'verified' && repeated.status === 'verified', 'Verified event replay is idempotent.');
  check(await claimStatus(success) === 'completed', 'Verified success completes the redemption.');
  check(await sql(`select count(*) from public.devcon26_test_coupon_claims
    where session_id = ${literal(success.id)}::uuid and status = 'completed';`) === '1', 'A replay must not double-count.');
  await expectFailure(prepareStatement(randomUUID(), 'SUCCESS'), /coupon/i);

  await createCoupon('RECOVERED', { maximum: 1 });

  const recovered = await prepare('RECOVERED');
  const recoveredEvent = `event-${randomUUID()}`;

  await confirm(recovered, { event: recoveredEvent, status: 'failed', hash: 'b'.repeat(64) });

  const recoveredSuccess = await confirm(recovered, { event: recoveredEvent, hash: 'c'.repeat(64) });
  const recoveredObservation = await json(`select row_to_json(e) from public.devcon26_test_payment_events e
    where provider_event_id = ${literal(recoveredEvent)};`);

  check(recoveredSuccess.status === 'verified' && await claimStatus(recovered) === 'completed',
    'Trusted failed-to-success reconciliation must complete the same session and redemption.');
  check(recoveredObservation.status === 'verified' && recoveredObservation.payload_sha256 === 'c'.repeat(64),
    'Latest payment observation status and evidence hash must change atomically.');
  await confirm(recovered, { event: recoveredEvent, hash: 'c'.repeat(64) });
  check(await sql(`select count(*) from public.devcon26_test_coupon_claims
    where session_id = ${literal(recovered.id)}::uuid and status = 'completed';`) === '1',
  'Reconciled success retries must not double-count allowance.');

  await createCoupon('MISSING-CLAIM', { maximum: 1 });

  const missingClaim = await prepare('MISSING-CLAIM');

  await sql(`delete from public.devcon26_test_coupon_claims where session_id = ${literal(missingClaim.id)}::uuid;`);
  check((await confirm(missingClaim)).status === 'verified' && await claimStatus(missingClaim) === 'completed',
    'A missing claim must be accounted for before a payment can verify.');

  await createCoupon('MISSING-FULL', { maximum: 1 });

  const missingFull = await prepare('MISSING-FULL');

  await sql(`delete from public.devcon26_test_coupon_claims where session_id = ${literal(missingFull.id)}::uuid;`);
  await prepare('MISSING-FULL');
  check((await confirm(missingFull)).status === 'refund_required' && await claimStatus(missingFull) === 'exception',
    'A missing claim cannot bypass an exhausted allowance.');

  await createCoupon('LATE-AVAILABLE', { maximum: 1 });

  const lateAvailable = await prepare('LATE-AVAILABLE');

  await expireHold(lateAvailable);
  check((await confirm(lateAvailable)).status === 'verified', 'Late success reacquires allowance when available.');

  await createCoupon('LATE-FULL', { maximum: 1 });

  const lateFull = await prepare('LATE-FULL');

  await expireHold(lateFull);

  const reassigned = await prepare('LATE-FULL');

  await confirm(reassigned);

  const lateException = await confirm(lateFull);

  check(lateException.status === 'refund_required' && await claimStatus(lateFull) === 'exception',
    'Late success after reallocation must persist a visible needs-attention exception.');

  await createCoupon('MISMATCH');

  const mismatch = await prepare('MISMATCH');

  check((await confirm(mismatch, { amount: mismatch.amount_minor + 1 })).status === 'refund_required',
    'Provider-confirmed amount mismatch cannot be reported as an ordinary failed payment.');

  const wrongCurrency = await prepare(null);

  check((await confirm(wrongCurrency, { currency: 'USD' })).status === 'refund_required',
    'Provider-confirmed currency mismatch requires attention.');

  const wrongDomain = await prepare(null);

  await assert.rejects(() => confirm(wrongDomain, { domain: 'live' }), /unverified/i);
  checks += 1;
  await assert.rejects(() => confirm(wrongDomain, { status: 'pending' }), /unverified/i);
  checks += 1;
  await expectFailure(`select public.confirm_devcon26_test_checkout(
    ${literal(wrongDomain.payment_reference)}, null, ${wrongDomain.amount_minor}, 'GHS',
    'test', 'success', ${literal('a'.repeat(64))});`, /unverified/i);

  const missingAmount = await prepare(null);

  check((await confirm(missingAmount, { amount: null })).status === 'refund_required',
    'A null provider amount must never be accepted as a verified payment.');

  const anotherSession = await prepare(null);

  await assert.rejects(() => confirm(anotherSession, { event: providerEvent }), /event_conflict/i);
  checks += 1;
  await confirm(initial);
  await expectFailure(prepareStatement(replayKey, 'FIXED'), /finished/i);

  const ledger = await json('select public.list_devcon26_test_coupons(2026, 1, 2, 1, 2);');

  check(ledger.coupons.length === 2 && ledger.checkouts.length === 2
    && ledger.total > 2 && ledger.checkout_total > 2, 'Owner ledger pages are bounded and retain totals.');
  await expectFailure('select public.list_devcon26_test_coupons(2026, 1, 51);', /invalid/i);
  await expectFailure('select public.list_devcon26_test_coupons(null);', /invalid/i);
  await expectFailure('select public.list_devcon26_test_coupons(2026, null);', /invalid/i);
  await expectFailure('select public.list_devcon26_test_coupons(2026, 1, null);', /invalid/i);
  await expectFailure('select public.list_devcon26_test_coupons(2026, 1, 2, null);', /invalid/i);
  await expectFailure('select public.list_devcon26_test_coupons(2026, 1, 2, 1, null);', /invalid/i);

  const frozenCoupon = await createCoupon('FROZEN');
  const frozenSession = await prepare('FROZEN');

  await sql(`select public.toggle_devcon26_test_coupon(${literal(frozenCoupon.id)}::uuid, false, 'owner@example.invalid');`);
  check((await confirm(frozenSession)).status === 'verified', 'Disabling a code must not invalidate an existing frozen payment.');
  await expectFailure(`update public.devcon26_test_coupon_codes set discount_value = 2000
    where id = ${literal(frozenCoupon.id)}::uuid;`, /immutable|terms/i);

  for (const role of ['anon', 'authenticated']) {
    await expectFailure(`set role ${role}; select * from public.devcon26_test_coupon_codes;`, /permission denied/i);
    await expectFailure(`set role ${role}; select * from public.devcon26_test_coupon_claims;`, /permission denied/i);
    await expectFailure(`set role ${role}; select public.quote_devcon26_test_checkout('regular', 'FIXED');`, /permission denied/i);
    await expectFailure(`set role ${role}; select public.list_devcon26_test_coupons(2026);`, /permission denied/i);
  }

  console.log(`Passed ${checks} real PostgreSQL coupon checks, including concurrent processes.`);
} finally {
  if (started) {
    await run(join(bindir, 'pg_ctl'), ['-D', dataDirectory, '-m', 'fast', 'stop']);
  }

  console.log(`Temporary test files retained for inspection: ${taskDirectory}`);
}
