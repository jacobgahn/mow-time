import type { Request, Response } from 'express';
import { mowPlanSchema, polygonRingsSchema } from '../schemas/mowPlanSchema.js';
import { planMowPath } from '../services/mowPlanner.js';

export function handleMowTimeRequest(req: Request, res: Response): Response {
  // Filter out invalid polygons before validation
  const body = { ...req.body };
  if (Array.isArray(body.polygons)) {
    body.polygons = body.polygons.filter((rings: unknown) => {
      return polygonRingsSchema.safeParse(rings).success;
    });
  }

  const parsed = mowPlanSchema.safeParse(body);

  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten();
    return res.status(400).json({
      error: 'Invalid payload',
      fieldErrors,
      formErrors,
    });
  }

  const plan = planMowPath(parsed.data);

  return res.status(200).json(plan);
}
