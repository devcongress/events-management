const SPEAKER_INTAKE_TOKEN_PATH = /(\/api\/events\/[^/]+\/speaker-intake\/)[^/]+/g;
const EVENT_SUBMISSION_MANAGEMENT_API_PATH = /(\/api\/public\/event-submissions\/manage\/)[^/]+/g;
const EVENT_SUBMISSION_MANAGEMENT_PAGE_PATH = /(\/event-amendments\/)[^/]+/g;

export function securitySafeRequestPath(path: string): string {
  return path
    .replace(SPEAKER_INTAKE_TOKEN_PATH, '$1[redacted]')
    .replace(EVENT_SUBMISSION_MANAGEMENT_API_PATH, '$1[redacted]')
    .replace(EVENT_SUBMISSION_MANAGEMENT_PAGE_PATH, '$1[redacted]');
}

export function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
