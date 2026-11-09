import type { Context } from 'hono';
import { managedPaymentSecret } from '@/lib/managed-conference-checkout';
import { inspectPaystackLiveTransaction, readPaystackTestTransaction, type PaystackObservation } from '@/lib/annual-conference-ticket-payments';
import { managedCheckoutRpc, managedPaymentEnvironment } from '@/server/managed-conference-checkout';

export class PaystackDiagnosticConfigurationError extends Error {
  constructor() {
    super('Paystack diagnostic credentials unavailable.');
    this.name = 'PaystackDiagnosticConfigurationError';
  }
}

export async function inspectStoredPaystackAttempt(c: Context, input: { reference: string; mode: 'live' | 'test' }): Promise<PaystackObservation> {
  const secretKey = managedPaymentSecret(managedPaymentEnvironment(c), input.mode);

  if (!secretKey) throw new PaystackDiagnosticConfigurationError();
  const startedAt = new Date().toISOString();
  let observation: PaystackObservation | null = null;
  const onObservation = async (value: PaystackObservation) => { observation = value; };

  try {
    const request = { secretKey, paymentReference: input.reference, onObservation };

    if (input.mode === 'test') await readPaystackTestTransaction(request);
    else await inspectPaystackLiveTransaction(request);
    if (!observation) throw new Error('Missing provider observation.');
  } catch {
    await managedCheckoutRpc(c, 'record_managed_paystack_observation', {
      p_reference: input.reference, p_started_at: startedAt, p_status: null, p_reason: null,
    });

    throw new Error('Paystack status check failed. The last known result was retained.');
  }
  const result = observation as PaystackObservation;

  await managedCheckoutRpc(c, 'record_managed_paystack_observation', {
    p_reference: input.reference, p_started_at: startedAt, p_status: result.status, p_reason: result.reason,
  });

  return result;
}
