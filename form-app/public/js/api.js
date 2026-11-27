export class ApiError extends Error {
  constructor(status, err) {
    super((err && err.message) || 'Something went wrong');
    this.status = status;
    this.code = err && err.code;
    this.fields = (err && err.fields) || {};
  }
}

async function call(method, path, body) {
  const opt = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'form' } };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, opt);
  } catch {
    throw new ApiError(0, { message: 'Cannot reach the server. Check your connection.' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && data && data.error && data.error.code === 'unauthenticated') {
      window.dispatchEvent(new Event('auth-lost'));
    }
    throw new ApiError(res.status, data && data.error);
  }
  return data;
}

export const get = (p) => call('GET', p);
export const post = (p, b = {}) => call('POST', p, b);
export const put = (p, b) => call('PUT', p, b);
export const patch = (p, b) => call('PATCH', p, b);
export const del = (p, b = {}) => call('DELETE', p, b);
