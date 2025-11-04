import { describe, expect, it } from 'vitest';
import type { MowPlanRequest } from '@mow-time/types';
import { planMowPath } from './mowPlanner.js';

const rectangle: MowPlanRequest['polygons'][number] = [
  [-122.42, 37.77],
  [-122.42, 37.78],
  [-122.41, 37.78],
  [-122.41, 37.77]
];

describe('planMowPath', () => {
  it('generates a striped path starting at the first polygon point', () => {
    const request: MowPlanRequest = {
      deckWidthInches: 21,
      polygons: [rectangle]
    };

    const result = planMowPath(request);

    expect(result.path.length).toBeGreaterThan(0);
    expect(result.path[0]).toEqual(rectangle[0]);
    expect(hasAlternatingSegments(result.path)).toBe(true);
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

function hasAlternatingSegments(path: readonly [number, number][]): boolean {
  if (path.length < 4) {
    return false;
  }

  const firstSegmentDirection = Math.sign(path[1][0] - path[0][0]);

  for (let index = 2; index < path.length; index += 2) {
    const direction = Math.sign(path[index + 1]?.[0] - path[index]?.[0] ?? 0);
    if (direction === firstSegmentDirection) {
      return false;
    }
  }

  return true;
}

