import type { Coordinate, MowPlanRequest, MowPlanResponse, PolygonRings } from '@mow-time/types';

const METERS_PER_INCH = 0.0254;
const METERS_PER_DEGREE_LAT = 111_320;
const MIN_STRIPES = 3;
const MAX_STRIPES = 200;

export function planMowPath(payload: MowPlanRequest): MowPlanResponse {
  const path: Coordinate[] = [];

  for (const rings of payload.polygons) {
    if (!Array.isArray(rings) || rings.length === 0) {
      continue;
    }

    const outer = rings[0];
    const holes = rings.slice(1);
    if (outer.length === 0) {
      continue;
    }

    const spiralPath = buildConcentricSpiralPath(outer, holes, payload.deckWidthInches);

    if (spiralPath.length === 0) {
      continue;
    }

    appendConnector(path, spiralPath[0]);
    path.push(...spiralPath);
  }

  return { path };
}

function buildConcentricSpiralPath(
  outer: Coordinate[],
  holes: Coordinate[][],
  deckWidthInches: number,
): Coordinate[] {
  if (outer.length < 3) {
    return [];
  }

  const path: Coordinate[] = [];
  const deckWidthMeters = deckWidthInches * METERS_PER_INCH;
  const centroid = calculateCentroid(outer);

  // Calculate offset distance in degrees
  const offsetDistanceDegrees = metersToDegrees(deckWidthMeters, centroid[0]);

  // Filter out points that are inside obstacles from the initial ring
  let currentRing = filterPointsOutsideObstacles(outer, holes);
  
  if (currentRing.length < 3) {
    return [];
  }

  let ringIndex = 0;

  // Generate concentric rings until the polygon becomes too small
  while (currentRing.length >= 3) {
    // Trace the current ring boundary, avoiding obstacles
    // Alternate direction: even rings go forward, odd rings go backward for smoother pattern
    const ringPath = traceRingBoundaryAvoidingObstacles(
      currentRing,
      holes,
      ringIndex % 2 === 1,
    );
    
    if (ringPath.length > 0) {
      if (path.length > 0) {
        // Connect to previous ring at the closest point
        const closestPoint = findClosestPoint(ringPath[0], path[path.length - 1]);
        appendConnector(path, closestPoint);
      }
      path.push(...ringPath);
    }

    // Offset inward for next ring, avoiding obstacles
    const nextRing = offsetPolygonInwardAvoidingObstacles(
      currentRing,
      centroid,
      offsetDistanceDegrees,
      holes,
    );
    
    // Check if offset created a valid polygon and it's not too small
    if (nextRing.length < 3) {
      break;
    }

    // Check if polygon area is too small (all points converged)
    const area = calculatePolygonArea(nextRing);
    if (area < 1e-10) {
      break;
    }

    // Check if the ring has shrunk significantly (converged toward center)
    const currentArea = calculatePolygonArea(currentRing);
    const nextArea = calculatePolygonArea(nextRing);
    if (nextArea < currentArea * 0.1) {
      // Ring has shrunk too much, likely converged
      break;
    }

    currentRing = nextRing;
    ringIndex++;

    // Safety limit
    if (ringIndex > MAX_STRIPES) {
      break;
    }
  }

  return path;
}

function calculateCentroid(polygon: Coordinate[]): Coordinate {
  let sumLat = 0;
  let sumLng = 0;

  for (const [lat, lng] of polygon) {
    sumLat += lat;
    sumLng += lng;
  }

  return [sumLat / polygon.length, sumLng / polygon.length];
}

function pointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInAnyObstacle(point: Coordinate, holes: Coordinate[][]): boolean {
  return holes.some((hole) => pointInPolygon(point, hole));
}

function filterPointsOutsideObstacles(
  polygon: Coordinate[],
  holes: Coordinate[][],
): Coordinate[] {
  if (holes.length === 0) {
    return polygon;
  }

  return polygon.filter((point) => !isPointInAnyObstacle(point, holes));
}

function offsetPolygonInwardAvoidingObstacles(
  polygon: Coordinate[],
  centroid: Coordinate,
  offsetDistanceDegrees: number,
  holes: Coordinate[][],
): Coordinate[] {
  const [centroidLat, centroidLng] = centroid;
  const offset: Coordinate[] = [];

  for (const [lat, lng] of polygon) {
    // Calculate direction vector from point to centroid
    const dx = centroidLng - lng;
    const dy = centroidLat - lat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < offsetDistanceDegrees) {
      // Point is too close to centroid, skip it
      continue;
    }

    // Normalize and scale by offset distance
    const normalizedDx = (dx / distance) * offsetDistanceDegrees;
    const normalizedDy = (dy / distance) * offsetDistanceDegrees;

    // Move point toward centroid
    let newLat = lat + normalizedDy;
    let newLng = lng + normalizedDx;
    const newPoint: Coordinate = [newLat, newLng];

    // If the new point is inside an obstacle, try to push it outward
    if (isPointInAnyObstacle(newPoint, holes)) {
      // Push the point away from obstacles
      const pushedPoint = pushPointAwayFromObstacles(newPoint, holes, offsetDistanceDegrees);
      if (pushedPoint && !isPointInAnyObstacle(pushedPoint, holes)) {
        offset.push(pushedPoint);
      }
      // If we can't push it out, skip this point
      continue;
    }

    offset.push(newPoint);
  }

  return offset;
}

function pushPointAwayFromObstacles(
  point: Coordinate,
  holes: Coordinate[][],
  offsetDistance: number,
): Coordinate | null {
  // Find the closest obstacle and push away from it
  let closestHole: Coordinate[] | null = null;
  let minDistance = Infinity;

  for (const hole of holes) {
    if (pointInPolygon(point, hole)) {
      const centroid = calculateCentroid(hole);
      const [lat, lng] = point;
      const [centLat, centLng] = centroid;
      const distance = Math.sqrt(
        Math.pow(lat - centLat, 2) + Math.pow(lng - centLng, 2),
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestHole = hole;
      }
    }
  }

  if (!closestHole) {
    return null;
  }

  const centroid = calculateCentroid(closestHole);
  const [lat, lng] = point;
  const [centLat, centLng] = centroid;

  // Calculate direction away from obstacle centroid
  const dx = lng - centLng;
  const dy = lat - centLat;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 1e-10) {
    return null;
  }

  // Push point outward by offset distance
  const normalizedDx = (dx / distance) * offsetDistance;
  const normalizedDy = (dy / distance) * offsetDistance;

  return [lat + normalizedDy, lng + normalizedDx];
}

function offsetPolygonInward(
  polygon: Coordinate[],
  centroid: Coordinate,
  offsetDistanceDegrees: number,
): Coordinate[] {
  const [centroidLat, centroidLng] = centroid;
  const offset: Coordinate[] = [];

  for (const [lat, lng] of polygon) {
    // Calculate direction vector from point to centroid
    const dx = centroidLng - lng;
    const dy = centroidLat - lat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < offsetDistanceDegrees) {
      // Point is too close to centroid, skip it
      continue;
    }

    // Normalize and scale by offset distance
    const normalizedDx = (dx / distance) * offsetDistanceDegrees;
    const normalizedDy = (dy / distance) * offsetDistanceDegrees;

    // Move point toward centroid
    const newLat = lat + normalizedDy;
    const newLng = lng + normalizedDx;

    offset.push([newLat, newLng]);
  }

  return offset;
}

function traceRingBoundaryAvoidingObstacles(
  ring: Coordinate[],
  holes: Coordinate[][],
  reverse: boolean,
): Coordinate[] {
  if (holes.length === 0) {
    return traceRingBoundary(ring, reverse);
  }

  const path: Coordinate[] = [];
  const workingRing = reverse ? [...ring].reverse() : [...ring];

  for (let i = 0; i < workingRing.length; i++) {
    const current = workingRing[i];
    const next = workingRing[(i + 1) % workingRing.length];

    // Check if current point is in an obstacle
    if (isPointInAnyObstacle(current, holes)) {
      continue;
    }

    // Check if the segment from current to next crosses through an obstacle
    const segmentCrossesObstacle = doesSegmentCrossObstacle(current, next, holes);

    if (segmentCrossesObstacle) {
      // Skip this segment, but keep the current point if it's not in obstacle
      // This will create a gap in the path
      if (path.length > 0 && !coordinatesEqual(path[path.length - 1], current)) {
        path.push([...current]);
      }
      continue;
    }

    // Add current point
    if (path.length === 0 || !coordinatesEqual(path[path.length - 1], current)) {
      path.push([...current]);
    }

    // Add next point if it's safe
    if (!isPointInAnyObstacle(next, holes)) {
      if (!coordinatesEqual(path[path.length - 1], next)) {
        path.push([...next]);
      }
    }
  }

  // Close the ring if needed and possible
  if (path.length > 2 && !coordinatesEqual(path[0], path[path.length - 1])) {
    const first = path[0];
    const last = path[path.length - 1];
    // Only close if the closing segment doesn't cross obstacles
    if (!doesSegmentCrossObstacle(last, first, holes)) {
      path.push([...first]);
    }
  }

  return path;
}

function doesSegmentCrossObstacle(
  start: Coordinate,
  end: Coordinate,
  holes: Coordinate[][],
): boolean {
  // Check if midpoint of segment is in an obstacle (simple check)
  const midLat = (start[0] + end[0]) / 2;
  const midLng = (start[1] + end[1]) / 2;
  const midpoint: Coordinate = [midLat, midLng];

  return isPointInAnyObstacle(midpoint, holes);
}

function traceRingBoundary(ring: Coordinate[], reverse: boolean): Coordinate[] {
  // Return the ring coordinates, optionally reversed for alternating spiral direction
  const path: Coordinate[] = reverse ? [...ring].reverse() : [...ring];
  
  // Close the ring if not already closed
  if (path.length > 0 && !coordinatesEqual(path[0], path[path.length - 1])) {
    path.push([...path[0]]);
  }

  return path;
}

function findClosestPoint(target: Coordinate, reference: Coordinate): Coordinate {
  // For now, just return the target point
  // Could be improved to find the actual closest point on the ring
  return target;
}

function calculatePolygonArea(polygon: Coordinate[]): number {
  if (polygon.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const [lat1, lng1] = polygon[i];
    const [lat2, lng2] = polygon[j];
    area += lng1 * lat2 - lng2 * lat1;
  }

  return Math.abs(area / 2);
}

function metersToDegrees(meters: number, latitude: number): number {
  const metersPerDegreeLat = METERS_PER_DEGREE_LAT;
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(degreesToRadians(latitude));
  
  // Use average for offset distance (approximation)
  const avgMetersPerDegree = (metersPerDegreeLat + metersPerDegreeLon) / 2;
  return meters / avgMetersPerDegree;
}

function buildStripingPath(outer: Coordinate[], deckWidthInches: number): Coordinate[] {
  const latitudes = outer.map(([lat]) => lat);
  const longitudes = outer.map(([, lng]) => lng);

  if (longitudes.length === 0 || latitudes.length === 0) {
    return [];
  }

  const latMin = Math.min(...latitudes);
  const latMax = Math.max(...latitudes);
  const lonMin = Math.min(...longitudes);
  const lonMax = Math.max(...longitudes);

  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  const centerLat = (latMax + latMin) / 2;

  const orientation: 'horizontal' | 'vertical' = Math.abs(latSpan) >= Math.abs(lonSpan)
    ? 'horizontal'
    : 'vertical';

  if (orientation === 'horizontal') {
    const spacing = toLatitudeDegrees(deckWidthInches);
    return createHorizontalStripes(latMin, latMax, lonMin, lonMax, latSpan, spacing);
  }

  const spacing = toLongitudeDegrees(deckWidthInches, centerLat);
  return createVerticalStripes(latMin, latMax, lonMin, lonMax, lonSpan, spacing);
}

function createHorizontalStripes(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  latSpan: number,
  preferredSpacing: number
): Coordinate[] {
  if (!Number.isFinite(latMin) || !Number.isFinite(latMax) || latMin === latMax) {
    return [
      [latMin, lonMin],
      [latMax, lonMax]
    ];
  }

  const stripeCount = chooseStripeCount(latSpan, preferredSpacing);
  const actualSpacing = stripeCount > 1 ? latSpan / (stripeCount - 1) : latSpan;
  const stripes: Coordinate[] = [];

  for (let index = 0; index < stripeCount; index += 1) {
    const currentLat = latMin + actualSpacing * index;
    const leftToRight = index % 2 === 0;
    const start: Coordinate = leftToRight ? [currentLat, lonMin] : [currentLat, lonMax];
    const end: Coordinate = leftToRight ? [currentLat, lonMax] : [currentLat, lonMin];

    stripes.push(start, end);
  }

  return stripes;
}

function createVerticalStripes(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  lonSpan: number,
  preferredSpacing: number
): Coordinate[] {
  if (!Number.isFinite(lonMin) || !Number.isFinite(lonMax) || lonMin === lonMax) {
    return [
      [latMin, lonMin],
      [latMax, lonMax]
    ];
  }

  const stripeCount = chooseStripeCount(lonSpan, preferredSpacing);
  const actualSpacing = stripeCount > 1 ? lonSpan / (stripeCount - 1) : lonSpan;
  const stripes: Coordinate[] = [];

  for (let index = 0; index < stripeCount; index += 1) {
    const currentLon = lonMin + actualSpacing * index;
    const topToBottom = index % 2 === 0;
    const start: Coordinate = topToBottom ? [latMin, currentLon] : [latMax, currentLon];
    const end: Coordinate = topToBottom ? [latMax, currentLon] : [latMin, currentLon];

    stripes.push(start, end);
  }

  return stripes;
}

function chooseStripeCount(span: number, preferredSpacing: number): number {
  if (!Number.isFinite(span) || span <= 0) {
    return MIN_STRIPES;
  }

  const spacing = preferredSpacing > 0 ? preferredSpacing : span / MIN_STRIPES;
  const estimated = Math.ceil(span / spacing) + 1;
  return Math.max(MIN_STRIPES, Math.min(MAX_STRIPES, estimated));
}

function toLatitudeDegrees(deckWidthInches: number): number {
  return Math.max((deckWidthInches * METERS_PER_INCH) / METERS_PER_DEGREE_LAT, 1e-6);
}

function toLongitudeDegrees(deckWidthInches: number, latitude: number): number {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(degreesToRadians(latitude));
  if (!Number.isFinite(metersPerDegreeLon) || metersPerDegreeLon <= 0) {
    return 1e-6;
  }

  return Math.max((deckWidthInches * METERS_PER_INCH) / metersPerDegreeLon, 1e-6);
}

function appendConnector(path: Coordinate[], coordinate: Coordinate): void {
  const last = path[path.length - 1];
  if (!last || !coordinatesEqual(last, coordinate)) {
    path.push([...coordinate]);
  }
}

function coordinatesEqual(a: Coordinate, b: Coordinate): boolean {
  const [alat, alng] = a;
  const [blat, blng] = b;
  return Math.abs(alat - blat) < 1e-10 && Math.abs(alng - blng) < 1e-10;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

