const SPEAKER_INTAKE_TOKEN_PATH = /(\/api\/events\/[^/]+\/speaker-intake\/)[^/]+/g;

export function securitySafeRequestPath(path: string): string {
  return path.replace(SPEAKER_INTAKE_TOKEN_PATH, '$1[redacted]');
}

export function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
