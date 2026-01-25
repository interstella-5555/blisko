import { describe, it, expect } from 'vitest';
import { app } from '../src/index';

describe('Health endpoint', () => {
  it('returns ok status', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/unknown-route');

    expect(res.status).toBe(404);
  });
});
