import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../../src/config/constants.js';
import { api_request, build_request_headers } from '../../src/services/api_client.js';

// Replaces fetch with a stub that answers once with the given status and JSON body.
function stub_fetch_response(status, response_body) {
  const fetch_stub = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => (response_body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(response_body)),
  });
  vi.stubGlobal('fetch', fetch_stub);
  return fetch_stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('build_request_headers', () => {
  it('adds JSON and auth headers only when needed', () => {
    expect(build_request_headers(false, null)).toEqual({});
    expect(build_request_headers(true, 'token')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    });
  });
});

describe('api_request', () => {
  it('sends JSON to the API and returns the parsed body', async () => {
    const fetch_stub = stub_fetch_response(201, { id: 'user-1' });

    const response_body = await api_request('/auth/signup', { method: 'POST', body: { username: 'sam' } });

    expect(response_body).toEqual({ id: 'user-1' });
    expect(fetch_stub).toHaveBeenCalledWith(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username":"sam"}',
    });
  });

  it('sends FormData as-is, without a JSON content type', async () => {
    const fetch_stub = stub_fetch_response(201, { id: 'resource-1' });
    const upload_form = new FormData();
    upload_form.append('title', 'Week 1');

    await api_request('/skills/s1/resources/files', { method: 'POST', body: upload_form, access_token: 'token' });

    expect(fetch_stub.mock.calls[0][1]).toEqual({
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: upload_form,
    });
  });

  it('returns null for 204 responses', async () => {
    stub_fetch_response(204);

    await expect(api_request('/account', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('throws the server message with status and field errors', async () => {
    stub_fetch_response(400, { error: 'Please fix the highlighted fields', field_errors: { email: 'Bad' } });

    await expect(api_request('/auth/signup')).rejects.toMatchObject({
      message: 'Please fix the highlighted fields',
      status: 400,
      field_errors: { email: 'Bad' },
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stub_fetch_response(502);

    await expect(api_request('/health')).rejects.toThrow('Request failed with status 502');
  });
});
