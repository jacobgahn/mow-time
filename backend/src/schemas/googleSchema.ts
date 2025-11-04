import { z } from 'zod';

export const placeAutocompleteSchema = z.object({
  input: z.string().min(1, 'Input is required').max(256),
  sessionToken: z.string().optional()
});

export type PlaceAutocompletePayload = z.infer<typeof placeAutocompleteSchema>;

export const placeDetailsSchema = z.object({
  placeId: z.string().min(1, 'placeId is required'),
  sessionToken: z.string().optional()
});

export type PlaceDetailsPayload = z.infer<typeof placeDetailsSchema>;
