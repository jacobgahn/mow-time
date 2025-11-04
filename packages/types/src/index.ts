export type Coordinate = [number, number];

export type Polygon = Coordinate[];

export interface MowPlanRequest {
  deckWidthInches: number;
  polygons: Polygon[];
}

export interface MowPlanResponse {
  path: Coordinate[];
}

