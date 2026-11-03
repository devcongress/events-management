import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadMultipart } from './upload-multipart';

class FakeRequest {
  static current: FakeRequest;
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void; onload?: () => void } = {};
  status = 200;
  responseText = '{}';
  withCredentials = false;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  url = '';
  body: FormData | null = null;

  constructor() {
    FakeRequest.current = this;
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('multipart uploads', () => {
  it('reports progress and resolves only after the server accepts the file', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeRequest);
    const progress = vi.fn();
    const body = new FormData();
    const result = uploadMultipart<{ id: string }>('/api/upload', body, { onProgress: progress });
    const request = FakeRequest.current;

    expect(request.url).toBe('/api/upload');
    expect(request.withCredentials).toBe(true);
    expect(request.body).toBe(body);
    request.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 });
    request.upload.onload?.();
    request.responseText = '{"id":"saved"}';
    request.onload?.();
    await expect(result).resolves.toEqual({ id: 'saved' });
    expect(progress.mock.calls).toEqual([[50], [100]]);
  });

  it('uses the configured split API origin and retains server validation errors', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
    vi.stubEnv('VITE_FORCE_API_BASE_URL', 'true');
    vi.stubGlobal('XMLHttpRequest', FakeRequest);
    const result = uploadMultipart('/api/upload', new FormData());
    const request = FakeRequest.current;

    expect(request.url).toBe('https://api.example.test/api/upload');
    request.status = 400;
    request.responseText = '{"error":"Invalid file"}';
    request.onload?.();
    await expect(result).rejects.toThrow('Invalid file');
  });

  it('reports network failure so the caller can offer retry', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeRequest);
    const result = uploadMultipart('/api/upload', new FormData());

    FakeRequest.current.onerror?.();
    await expect(result).rejects.toThrow('Check your connection');
  });
});
