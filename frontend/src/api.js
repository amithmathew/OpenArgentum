const BASE = '/api';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path, params) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`${path}${query}`);
  },
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: async (path, formData) => {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', body: formData });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || 'Upload failed');
    }
    return res.json();
  },
  stream: (path, body, onEvent) => {
    // Use XMLHttpRequest for SSE streaming — works reliably on all browsers including iOS Safari,
    // which has issues with fetch() + ReadableStream for POST text/event-stream responses.
    // Returns { promise, abort } so callers can cancel the stream.
    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      xhr.open('POST', `${BASE}${path}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      let lastIndex = 0;

      xhr.onprogress = () => {
        const text = xhr.responseText.slice(lastIndex);
        lastIndex = xhr.responseText.length;
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try { onEvent(JSON.parse(data)); } catch {}
          }
        }
      };

      xhr.onload = () => {
        // Process any remaining data after stream completes
        if (xhr.status >= 200 && xhr.status < 300) {
          // Final parse of anything after lastIndex
          const remaining = xhr.responseText.slice(lastIndex);
          if (remaining.trim()) {
            const lines = remaining.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);
                if (data === '[DONE]') return;
                try { onEvent(JSON.parse(data)); } catch {}
              }
            }
          }
          resolve();
        } else {
          reject(new Error(`Stream failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Stream connection failed'));
      xhr.ontimeout = () => reject(new Error('Stream timed out'));
      xhr.timeout = 120000; // 2 minute timeout
      xhr.send(JSON.stringify(body));
    });
    return { promise, abort: () => xhr.abort() };
  },
};
