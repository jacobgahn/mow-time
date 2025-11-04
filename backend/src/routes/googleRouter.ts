import { Router } from 'express';
import { handlePlaceAutocomplete, handlePlaceDetails } from '../controllers/googleController.js';

const router = Router();

router.post('/place-autocomplete', handlePlaceAutocomplete);
router.post('/place-details', handlePlaceDetails);

export const googleRouter = router;
