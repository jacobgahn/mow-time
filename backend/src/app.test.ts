import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from './app.js';

describe('POST /api/mow-time', () => {
  it('rejects payloads that fail validation', async () => {
    const response = await request(app).post('/api/mow-time').send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('returns a mow plan for a valid polygon', async () => {
    const response = await request(app)
      .post('/api/mow-time')
      .send({
        deckWidthInches: 24,
        polygons: [
          [
            [-122.42, 37.77],
            [-122.42, 37.78],
            [-122.41, 37.78],
            [-122.41, 37.77]
          ]
        ]
      });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.path)).toBe(true);
    expect(response.body.path.length).toBeGreaterThan(0);
  });
});

