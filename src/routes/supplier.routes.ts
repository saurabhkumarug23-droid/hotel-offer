import { Router } from 'express';
import { SupplierController } from '../controllers/supplier.controller';

const router = Router();

router.get('/supplierA/hotels', SupplierController.getSupplierAHotels);
router.get('/supplierB/hotels', SupplierController.getSupplierBHotels);

export default router;
