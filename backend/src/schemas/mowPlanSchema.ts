import { z } from 'zod';

const coordinateSchema = z
  .tuple([z.coerce.number(), z.coerce.number()], {
    description: 'Latitude/longitude coordinate pair'
  })
  .refine((coordinate) => coordinate.every((value) => Number.isFinite(value)), {
    message: 'Coordinate values must be finite numbers'
  });

export const polygonSchema = z
  .array(coordinateSchema)
  .min(3, { message: 'Polygon must include at least three vertices' });

export const polygonRingsSchema = z.array(polygonSchema).min(1, { message: 'Outer ring is required' });

export const mowPlanSchema = z.object({
  deckWidthInches: z
    .coerce.number()
    .positive({ message: 'Deck width must be greater than zero' })
    .max(240, { message: 'Deck width over 20 feet is not supported' }),
  polygons: z.array(polygonRingsSchema).min(1, { message: 'At least one polygon is required' })
});

export type MowPlanPayload = z.infer<typeof mowPlanSchema>;

