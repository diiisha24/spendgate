import { Router } from 'express';
import * as reporting from '../controllers/reporting.controller.js';
import { approvalRouter } from './approval.routes.js';
import { healthRouter } from './health.routes.js';
import { purchaseRequestRouter } from './purchaseRequest.routes.js';

/** Root API router mounted at /api. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/purchase-requests', purchaseRequestRouter);
apiRouter.use('/approvals', approvalRouter);
apiRouter.get('/departments', reporting.departments);
apiRouter.get('/dashboard/summary', reporting.dashboard);
apiRouter.get('/audit-logs', reporting.auditLogs);
