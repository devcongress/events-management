const queueRequests = new WeakSet<Request>();
const scheduledRequests = new WeakSet<Request>();

export function paymentDiagnosticsDueRequest(url: string, secret: string): Request {
  const request = new Request(url, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } });

  scheduledRequests.add(request);

  return request;
}

export function isPaymentDiagnosticsDueRequest(request: Request): boolean {
  return scheduledRequests.has(request);
}

export function managedRecoveryQueueRequest(url: string, secret: string): Request {
  const request = new Request(url, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } });

  queueRequests.add(request);

  return request;
}

export function isManagedRecoveryQueueRequest(request: Request): boolean {
  return queueRequests.has(request);
}
