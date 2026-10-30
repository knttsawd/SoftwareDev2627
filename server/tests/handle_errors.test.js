import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle_errors, handle_not_found } from '../middleware/handle_errors.js';
import { create_http_error } from '../services/http_error.js';

function create_response_stub() {
  const response_stub = {};
  response_stub.status = vi.fn(() => response_stub);
  response_stub.json = vi.fn(() => response_stub);
  return response_stub;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handle_not_found', () => {
  it('responds 404 naming the method and path', () => {
    const response_stub = create_response_stub();

    handle_not_found({ method: 'GET', path: '/api/nope' }, response_stub);

    expect(response_stub.status).toHaveBeenCalledWith(404);
    expect(response_stub.json).toHaveBeenCalledWith({ error: 'No route for GET /api/nope' });
  });
});

describe('handle_errors', () => {
  it('sends http errors with their status, message and extra body', () => {
    const response_stub = create_response_stub();
    const http_error = create_http_error(400, 'Fix fields', { field_errors: { email: 'Bad' } });

    handle_errors(http_error, {}, response_stub, vi.fn());

    expect(response_stub.status).toHaveBeenCalledWith(400);
    expect(response_stub.json).toHaveBeenCalledWith({ error: 'Fix fields', field_errors: { email: 'Bad' } });
  });

  it('sends 5xx http errors as written and logs their cause', () => {
    const log_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response_stub = create_response_stub();
    const provider_error = new Error('upstream detail');

    handle_errors(create_http_error(502, 'The AI service could not answer.', {}, provider_error), {}, response_stub, vi.fn());

    expect(log_spy).toHaveBeenCalledWith(provider_error);
    expect(response_stub.status).toHaveBeenCalledWith(502);
    expect(response_stub.json).toHaveBeenCalledWith({ error: 'The AI service could not answer.' });
  });

  it('keeps the message of other 4xx errors, like invalid JSON', () => {
    const response_stub = create_response_stub();
    const body_parser_error = Object.assign(new Error('Unexpected token'), { status: 400 });

    handle_errors(body_parser_error, {}, response_stub, vi.fn());

    expect(response_stub.status).toHaveBeenCalledWith(400);
  });

  it('logs unexpected errors and hides their details', () => {
    const log_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response_stub = create_response_stub();

    handle_errors(new Error('secret database detail'), {}, response_stub, vi.fn());

    expect(log_spy).toHaveBeenCalled();
    expect(response_stub.status).toHaveBeenCalledWith(500);
    expect(response_stub.json).toHaveBeenCalledWith({ error: 'Something went wrong. Please try again' });
  });
});
