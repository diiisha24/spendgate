import { Router } from 'express';
import * as controller from '../controllers/approval.controller.js';

export const approvalRouter = Router();

approvalRouter.get('/', controller.list);
approvalRouter.post('/:id/approve', controller.approve);
approvalRouter.post('/:id/reject', controller.reject);
