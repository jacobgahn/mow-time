import type { Request, Response } from 'express';
import {
  fetchPlaceAutocomplete,
  fetchPlaceDetails
} from '../services/googlePlacesClient.js';
import { placeAutocompleteSchema, placeDetailsSchema } from '../schemas/googleSchema.js';

export async function handlePlaceAutocomplete(req: Request, res: Response): Promise<Response> {
  const parsed = placeAutocompleteSchema.safeParse(req.body);

  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten();
    return res.status(400).json({ error: 'Invalid payload', fieldErrors, formErrors });
  }

  try {
    const predictions = await fetchPlaceAutocomplete(parsed.data);
    return res.status(200).json({ predictions });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Google Places Autocomplete failed'
    });
  }
}

export async function handlePlaceDetails(req: Request, res: Response): Promise<Response> {
  const parsed = placeDetailsSchema.safeParse(req.body);

  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten();
    return res.status(400).json({ error: 'Invalid payload', fieldErrors, formErrors });
  }

  try {
    const result = await fetchPlaceDetails(parsed.data);
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Google Place Details failed'
    });
  }
}
