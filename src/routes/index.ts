import { Router } from 'express';
import hotelRoutes from './hotel.routes';
import supplierRoutes from './supplier.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use(supplierRoutes);
router.use(hotelRoutes);
router.use(healthRoutes);

export default router;
