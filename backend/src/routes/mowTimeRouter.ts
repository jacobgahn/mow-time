import { Router } from 'express';
import { handleMowTimeRequest } from '../controllers/mowTimeController.js';

const router = Router();

router.post('/', handleMowTimeRequest);

export const mowTimeRouter = router;
