import { Router } from 'express';
import * as controller from '../controllers/purchaseRequest.controller.js';

export const purchaseRequestRouter = Router();

purchaseRequestRouter.get('/', controller.list);
purchaseRequestRouter.post('/', controller.create);
purchaseRequestRouter.get('/:id', controller.getById);
purchaseRequestRouter.patch('/:id', controller.update);
purchaseRequestRouter.delete('/:id', controller.remove);
purchaseRequestRouter.post('/:id/submit', controller.submit);
