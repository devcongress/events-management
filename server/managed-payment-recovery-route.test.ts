import { Hono } from 'hono';
import { beforeEach, expect, it, vi } from 'vitest';
import { managedPaymentReference } from '@/lib/managed-conference-checkout';
import { managedRecoveryQueueRequest } from './managed-recovery-request';
import { registerAnnualConferenceRegistrationRoutes } from './routes/annual-conference-registration';
import worker from './worker';
import type { ExecutionContext } from 'hono';
import type { AppBindings } from './http/app-bindings';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), payment: vi.fn(), livePayment: vi.fn(), confirm: vi.fn(), admission: vi.fn() }));

vi.mock('./app', () => ({ default: { fetch: (...args: Parameters<typeof app.fetch>) => app.fetch(...args) } }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/annual-conference-ticket-payments', () => ({ readPaystackTestTransaction: mocks.payment, inspectPaystackLiveTransaction: mocks.livePayment }));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({ confirmSupabaseAnnualConferenceTicketPayment: mocks.confirm }));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ retryAnnualConferenceAdmissionEmails: mocks.admission, admissionEmailReadiness: vi.fn() }));

const app = new Hono<AppBindings>();

registerAnnualConferenceRegistrationRoutes(app);

const orderId = '10000000-0000-4000-8000-000000000001';
const reference = managedPaymentReference(orderId, 'test');
const secret = 'fixture-scheduled-secret-with-enough-entropy';
const env = { SLACK_EVENTS_RETRY_SECRET: secret, PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture', DEVCON26_COMPLETE_TEST_ENABLED: 'true', MANAGED_PAYMENT_RECOVERY_OWNER_ENABLED: 'true' };
const request = (path: string, bindings = env, token = secret) => app.fetch(managedRecoveryQueueRequest(`https://events-management.internal${path}`, token), bindings);

beforeEach(() => {
  vi.resetAllMocks();
  let claimed = false;

  mocks.rpc.mockImplementation(async (name) => {
    if (name === 'claim_managed_payment_reconciliation') {
      if (claimed) return { data: [], error: null };
      claimed = true;

      return { data: [{ order_id: orderId, payment_reference: reference }], error: null };
    }

    return { data: null, error: null };
  });
  mocks.from.mockImplementation((table) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'annual_conference_ticket_payment_attempts'
      ? { order_id: orderId, provider: 'paystack', payment_reference: reference }
      : { id: orderId, edition_id: '20000000-0000-4000-8000-000000000001', payment_mode: 'test', checkout_origin: 'https://devcongress.org', checkout_settings_version: 1, quoted_processing_fee_policy: null }, error: null }) }) }),
  }));
  mocks.payment.mockResolvedValue({ status: 'verified', providerEventId: 'charge:123', amountMinor: 15000, currency: 'GHS' });
  mocks.confirm.mockImplementation(async (input) => ({ status: 'paid', amount_paid_minor: input.amountMinor, currency: input.currency, payment_reference: input.paymentReference }));
  mocks.admission.mockResolvedValue({ accepted: 0 });
});

it('recovers a missed webhook through real reconciliation and confirmation once', async () => {
  const path = '/api/internal/managed-payments/reconcile';
  const first = await request(path);

  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ checked: 1, resolved: 1, failed: 0 });
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith('finish_managed_payment_reconciliation', expect.objectContaining({ p_resolved: true }));
  expect(await (await request(path)).json()).toEqual({ checked: 0, resolved: 0, failed: 0 });
  expect(mocks.confirm).toHaveBeenCalledOnce();
});

it('rejects unauthorized requests and does not claim on a non-owner preview', async () => {
  const path = '/api/internal/managed-payments/reconcile';

  expect((await request(path, env, 'wrong')).status).toBe(404);
  expect((await app.request(path, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } }, env)).status).toBe(404);
  expect(await (await request(path, { ...env, MANAGED_PAYMENT_RECOVERY_OWNER_ENABLED: 'false' })).json()).toEqual({ checked: 0 });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('keeps the historical admission relay scoped while the owner queue uses managed dispatch', async () => {
  const managed = '/api/internal/managed-admission-emails/retry';

  expect((await request(managed, env, 'wrong')).status).toBe(404);
  expect((await app.request(managed, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } }, env)).status).toBe(404);
  await request(managed, { ...env, MANAGED_PAYMENT_RECOVERY_OWNER_ENABLED: 'false' });
  expect(mocks.admission).not.toHaveBeenCalled();
  await request(managed);
  expect(mocks.admission).toHaveBeenLastCalledWith(expect.anything(), { managed: true, scheduled: true });
  await request('/api/internal/annual-conference-admission-emails/retry');
  expect(mocks.admission).toHaveBeenLastCalledWith(expect.anything(), { scheduled: true });
});

it('finishes durably expired test orders but retains unconfirmed provider failures', async () => {
  mocks.confirm.mockResolvedValue({ status: 'expired', amount_paid_minor: 15000, currency: 'GHS', payment_reference: reference });
  expect(await (await request('/api/internal/managed-payments/reconcile')).json()).toEqual({ checked: 1, resolved: 1, failed: 0 });
  expect(mocks.rpc).toHaveBeenCalledWith('finish_managed_payment_reconciliation', expect.objectContaining({ p_resolved: true }));
});

it('leaves a failed provider transaction eligible for another check', async () => {
  mocks.payment.mockResolvedValue({ status: 'failed' });
  expect(await (await request('/api/internal/managed-payments/reconcile')).json()).toEqual({ checked: 1, resolved: 0, failed: 0 });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith('finish_managed_payment_reconciliation', expect.objectContaining({ p_resolved: false }));
});

it('recovers a missed live webhook using the live key and verified provider amount', async () => {
  const liveReference = managedPaymentReference(orderId, 'live');

  mocks.rpc.mockImplementation(async (name) => ({ data: name === 'claim_managed_payment_reconciliation' ? [{ order_id: orderId, payment_reference: liveReference }] : null, error: null }));
  mocks.from.mockImplementation((table) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'annual_conference_ticket_payment_attempts'
      ? { order_id: orderId, provider: 'paystack', payment_reference: liveReference }
      : { id: orderId, edition_id: '20000000-0000-4000-8000-000000000001', payment_mode: 'live', checkout_origin: null, checkout_settings_version: 1, quoted_processing_fee_policy: null }, error: null }) }) }),
  }));
  mocks.livePayment.mockResolvedValue({ status: 'success', charge: { providerEventId: 'charge:123', amountMinor: 15000, currency: 'GHS', facts: {} } });

  expect(await (await request('/api/internal/managed-payments/reconcile')).json()).toEqual({ checked: 1, resolved: 1, failed: 0 });
  expect(mocks.livePayment).toHaveBeenCalledWith(expect.objectContaining({ secretKey: 'sk_live_fixture', paymentReference: liveReference, onObservation: expect.any(Function) }));
  expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ paymentReference: liveReference, amountMinor: 15000, currency: 'GHS', providerEventId: 'managed:live:charge:123' }), expect.anything());
});

it('dispatches real queue messages to the private managed recovery handlers', async () => {
  const context = {} as ExecutionContext;

  await worker.queue({ messages: [{ body: { kind: 'payment-recovery' } }, { body: { kind: 'admission-recovery' } }] }, env, context);
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.admission).toHaveBeenCalledWith(expect.anything(), { managed: true, scheduled: true });
});

it('protects the separate diagnostics route and never invokes fulfillment or email', async () => {
  const path = '/api/internal/payment-diagnostics/check';

  expect((await request(path, env, 'wrong')).status).toBe(404);
  expect((await app.request(path, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } }, env)).status).toBe(404);
  expect(await (await request(path, { ...env, MANAGED_PAYMENT_RECOVERY_OWNER_ENABLED: 'false' })).json()).toEqual({ checked: 0 });
  mocks.rpc.mockImplementation(async (name) => ({ error: null, data: name === 'claim_unresolved_payment_diagnostics' ? [] : null }));
  expect(await (await request(path)).json()).toEqual({ checked: 0, failed: 0 });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.admission).not.toHaveBeenCalled();
});
