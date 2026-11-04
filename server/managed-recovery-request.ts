const queueRequests = new WeakSet<Request>();

export function managedRecoveryQueueRequest(url: string, secret: string): Request {
  const request = new Request(url, { method: 'POST', headers: { 'x-scheduled-job-secret': secret } });

  queueRequests.add(request);

  return request;
}

export function isManagedRecoveryQueueRequest(request: Request): boolean {
  return queueRequests.has(request);
}
