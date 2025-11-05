export type Coordinate = [number, number];

export type Polygon = Coordinate[];
export type PolygonRings = Coordinate[][]; // [outer, ...holes]

export interface MowPlanRequest {
  deckWidthInches: number;
  polygons: PolygonRings[];
}

export interface MowPlanResponse {
  path: Coordinate[];
}

