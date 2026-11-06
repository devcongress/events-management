type UploadOptions = {
  onProgress?: (percent: number | null) => void;
  headers?: Record<string, string>;
};

/** Send a multipart request with upload progress and the same split-origin behavior as fetch. */
export function uploadMultipart<T>(path: string, body: FormData, options: UploadOptions = {}): Promise<T> {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
  const splitApi = import.meta.env.VITE_FORCE_API_BASE_URL === 'true' && apiBase && path.startsWith('/api/');
  const url = splitApi ? `${apiBase}${path}` : path;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('POST', url);
    request.withCredentials = true;
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      options.onProgress?.(event.lengthComputable && event.total > 0
        ? Math.min(100, Math.floor(event.loaded / event.total * 100))
        : null);
    };
    request.upload.onload = () => options.onProgress?.(100);
    request.onerror = () => reject(new Error('The upload could not be completed. Check your connection and try again.'));
    request.onabort = () => reject(new Error('The upload was cancelled.'));
    request.onload = () => {
      let payload: unknown;

      try {
        payload = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        reject(new Error('Unable to read the upload response. Please try again.'));

        return;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as T);

        return;
      }

      const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'The upload could not be completed. Please try again.';

      reject(Object.assign(new Error(message), { status: request.status }));
    };
    request.send(body);
  });
}
