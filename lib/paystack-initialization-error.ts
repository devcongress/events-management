export class PaystackInitializationError extends Error {
  constructor(public readonly definitelyRejected: boolean) {
    super('Paystack could not initialize checkout.');
  }
}
