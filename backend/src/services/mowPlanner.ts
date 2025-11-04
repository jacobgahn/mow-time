import type { Coordinate, MowPlanRequest, MowPlanResponse, Polygon } from '@mow-time/types';

const METERS_PER_INCH = 0.0254;
const METERS_PER_DEGREE_LAT = 111_320;
const MIN_STRIPES = 3;
const MAX_STRIPES = 200;

export function planMowPath(payload: MowPlanRequest): MowPlanResponse {
  const path: Coordinate[] = [];

  for (const polygon of payload.polygons) {
    if (polygon.length === 0) {
      continue;
    }

    const stripes = buildStripingPath(polygon, payload.deckWidthInches);

    if (stripes.length === 0) {
      continue;
    }

    appendConnector(path, polygon[0]);
    path.push(...stripes);
  }

  return { path };
}

function buildStripingPath(polygon: Polygon, deckWidthInches: number): Coordinate[] {
  const longitudes = polygon.map(([lon]) => lon);
  const latitudes = polygon.map(([, lat]) => lat);

  if (longitudes.length === 0 || latitudes.length === 0) {
    return [];
  }

  const lonMin = Math.min(...longitudes);
  const lonMax = Math.max(...longitudes);
  const latMin = Math.min(...latitudes);
  const latMax = Math.max(...latitudes);

  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  const centerLat = (latMax + latMin) / 2;

  const orientation: 'horizontal' | 'vertical' = Math.abs(latSpan) >= Math.abs(lonSpan)
    ? 'horizontal'
    : 'vertical';

  if (orientation === 'horizontal') {
    const spacing = toLatitudeDegrees(deckWidthInches);
    return createHorizontalStripes(lonMin, lonMax, latMin, latMax, latSpan, spacing);
  }

  const spacing = toLongitudeDegrees(deckWidthInches, centerLat);
  return createVerticalStripes(lonMin, lonMax, latMin, latMax, lonSpan, spacing);
}

function createHorizontalStripes(
  lonMin: number,
  lonMax: number,
  latMin: number,
  latMax: number,
  latSpan: number,
  preferredSpacing: number
): Coordinate[] {
  if (!Number.isFinite(latMin) || !Number.isFinite(latMax) || latMin === latMax) {
    return [
      [lonMin, latMin],
      [lonMax, latMax]
    ];
  }

  const stripeCount = chooseStripeCount(latSpan, preferredSpacing);
  const actualSpacing = stripeCount > 1 ? latSpan / (stripeCount - 1) : latSpan;
  const stripes: Coordinate[] = [];

  for (let index = 0; index < stripeCount; index += 1) {
    const currentLat = latMin + actualSpacing * index;
    const leftToRight = index % 2 === 0;
    const start: Coordinate = leftToRight ? [lonMin, currentLat] : [lonMax, currentLat];
    const end: Coordinate = leftToRight ? [lonMax, currentLat] : [lonMin, currentLat];

    stripes.push(start, end);
  }

  return stripes;
}

function createVerticalStripes(
  lonMin: number,
  lonMax: number,
  latMin: number,
  latMax: number,
  lonSpan: number,
  preferredSpacing: number
): Coordinate[] {
  if (!Number.isFinite(lonMin) || !Number.isFinite(lonMax) || lonMin === lonMax) {
    return [
      [lonMin, latMin],
      [lonMax, latMax]
    ];
  }

  const stripeCount = chooseStripeCount(lonSpan, preferredSpacing);
  const actualSpacing = stripeCount > 1 ? lonSpan / (stripeCount - 1) : lonSpan;
  const stripes: Coordinate[] = [];

  for (let index = 0; index < stripeCount; index += 1) {
    const currentLon = lonMin + actualSpacing * index;
    const topToBottom = index % 2 === 0;
    const start: Coordinate = topToBottom ? [currentLon, latMin] : [currentLon, latMax];
    const end: Coordinate = topToBottom ? [currentLon, latMax] : [currentLon, latMin];

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
  const [ax, ay] = a;
  const [bx, by] = b;
  return Math.abs(ax - bx) < 1e-10 && Math.abs(ay - by) < 1e-10;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

