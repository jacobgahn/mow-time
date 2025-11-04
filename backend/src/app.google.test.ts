import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from './app.js';

const ORIGINAL_ENV = process.env;

describe('Google proxy endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV, GOOGLE_MAPS_API_KEY: 'fake-key' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('rejects autocomplete requests without input', async () => {
    const response = await request(app).post('/api/google/place-autocomplete').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects place details requests without placeId', async () => {
    const response = await request(app).post('/api/google/place-details').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('returns proxy error when Google fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({ status: 'INVALID_REQUEST', error_message: 'bad input' })
    } as unknown as Response);

    const response = await request(app)
      .post('/api/google/place-autocomplete')
      .send({ input: 'test' });

    expect(response.status).toBe(502);
    expect(response.body.error).toContain('bad input');
  });
});
