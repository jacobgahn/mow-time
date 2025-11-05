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
    if (outer.length === 0) {
      continue;
    }

    const stripes = buildStripingPath(outer, payload.deckWidthInches);

    if (stripes.length === 0) {
      continue;
    }

    appendConnector(path, outer[0]);
    path.push(...stripes);
  }

  return { path };
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

