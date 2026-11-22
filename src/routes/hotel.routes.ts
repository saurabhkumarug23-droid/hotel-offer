import { Router } from 'express';
import { hotelController } from '../controllers/hotel.controller';

const router = Router();

router.get('/api/hotels', hotelController.getHotels);

export default router;
