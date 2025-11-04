import type { Request, Response } from 'express';
import { mowPlanSchema } from '../schemas/mowPlanSchema.js';
import { planMowPath } from '../services/mowPlanner.js';

export function handleMowTimeRequest(req: Request, res: Response): Response {
  const parsed = mowPlanSchema.safeParse(req.body);

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
