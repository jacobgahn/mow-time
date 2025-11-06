import { describe, expect, it } from 'vitest';
import type { MowPlanRequest } from '@mow-time/types';
import { planMowPath } from './mowPlanner.js';

const rectangle: MowPlanRequest['polygons'][number] = [
  [
    [-122.42, 37.77],
    [-122.42, 37.78],
    [-122.41, 37.78],
    [-122.41, 37.77]
  ]
];

describe('planMowPath', () => {
  it('generates a mowing path starting at the first polygon point', () => {
    const request: MowPlanRequest = {
      deckWidthInches: 21,
      polygons: [rectangle]
    };

    const result = planMowPath(request);

    expect(result.path.length).toBeGreaterThan(0);
    expect(result.path[0]).toEqual(rectangle[0][0]);
    // Verify the path has multiple points (spiral/concentric pattern)
    expect(result.path.length).toBeGreaterThan(3);
  });

  it('returns an empty path when no polygons are provided', () => {
    const request: MowPlanRequest = {
      deckWidthInches: 21,
      polygons: []
    };

    const result = planMowPath(request);

    expect(result.path).toEqual([]);
  });
});

