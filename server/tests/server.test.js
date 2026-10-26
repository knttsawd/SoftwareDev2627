import { afterEach, describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { read_env } from '../config/env.js';
import { start_server } from '../server.js';

const RANDOM_FREE_PORT = 0;

let running_server;

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => running_server.close(resolve));
});

describe('start_server', () => {
  it('opens the database, picks the AI, starts listening and serves the health route', async () => {
    const log_spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    running_server = start_server({
      ...read_env({}),
      port: RANDOM_FREE_PORT,
      database_path: IN_MEMORY_DATABASE,
      uploads_path: 'unused-in-this-test',
    });
    await new Promise((resolve) => running_server.once('listening', resolve));

    const { port } = running_server.address();
    const response = await fetch(`http://localhost:${port}/api/health`);

    expect(await response.json()).toEqual({ status: 'ok' });
    expect(log_spy.mock.calls[0][0]).toContain('AI: mock, transcription: mock');
  });
});
