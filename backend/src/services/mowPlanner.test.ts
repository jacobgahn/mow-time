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
  const simplified: [number, number][] = [];

  for (const coordinate of path) {
    const last = simplified[simplified.length - 1];
    if (!last || !coordinatesEqual(last, coordinate)) {
      simplified.push([...coordinate] as [number, number]);
    }
  }

  if (simplified.length < 4) {
    return false;
  }

  const firstSegment = [simplified[0], simplified[1]] as const;
  if (!firstSegment[1]) {
    return false;
  }

  const firstDeltaLon = firstSegment[1][0] - firstSegment[0][0];
  const firstDeltaLat = firstSegment[1][1] - firstSegment[0][1];
  const horizontal = Math.abs(firstDeltaLon) >= Math.abs(firstDeltaLat);
  const baseDirection = horizontal
    ? Math.sign(firstDeltaLon)
    : Math.sign(firstDeltaLat);

  if (baseDirection === 0) {
    return false;
  }

  let expectedDirection = -baseDirection;

  for (let index = 2; index + 1 < simplified.length; index += 2) {
    const start = simplified[index];
    const end = simplified[index + 1];
    const delta = horizontal ? end[0] - start[0] : end[1] - start[1];
    const direction = Math.sign(delta);

    if (direction !== expectedDirection) {
      return false;
    }

    expectedDirection = -expectedDirection;
  }

  return true;
}

function coordinatesEqual(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
}

