import type { PurchaseCategory } from '@prisma/client';
import { approveRequest, rejectRequest } from '../services/approval.service.js';
import { createPurchaseRequest } from '../services/purchaseRequest.service.js';
import { WEB_CONTEXT } from '../types/context.js';
import { prisma } from './prisma.js';

/**
 * FICTIONAL demo data for hosted prototypes. Created through the real service
 * layer, so budgets, routing and audit logs behave exactly as in normal use.
 * Runs only when the database has no purchase requests yet.
 */
interface DemoRequest {
  title: string;
  description: string;
  amount: string;
  quantity: number;
  category: PurchaseCategory;
  department: string;
  requester: string;
  outcome: 'draft' | 'pending' | 'approved' | 'rejected';
  note?: string;
}

const DEMO_REQUESTS: DemoRequest[] = [
  {
    title: 'Design tool licences (10 seats)',
    description: 'Annual licences for the product design team.',
    amount: '48000',
    quantity: 10,
    category: 'SOFTWARE',
    department: 'Engineering',
    requester: 'Demo Requester (Engineering)',
    outcome: 'approved',
    note: 'Within the quarterly tooling plan.',
  },
  {
    title: 'Trade show booth deposit',
    description: 'Booth deposit for the regional fintech expo.',
    amount: '65000',
    quantity: 1,
    category: 'MARKETING',
    department: 'Marketing',
    requester: 'Demo Requester (Marketing)',
    outcome: 'pending',
  },
  {
    title: 'Ergonomic office chairs',
    description: 'Replacement chairs for the operations floor.',
    amount: '36000',
    quantity: 6,
    category: 'OFFICE_SUPPLIES',
    department: 'Operations',
    requester: 'Demo Requester (Operations)',
    outcome: 'pending',
  },
  {
    title: 'Courier service contract',
    description: 'Quarterly courier contract for document dispatch.',
    amount: '12000',
    quantity: 1,
    category: 'PROFESSIONAL_SERVICES',
    department: 'Operations',
    requester: 'Demo Requester (Operations)',
    outcome: 'pending',
  },
  {
    title: 'Cloud staging environment credits',
    description: 'Extra credits for load testing.',
    amount: '8500',
    quantity: 1,
    category: 'SOFTWARE',
    department: 'Engineering',
    requester: 'Demo Requester (Engineering)',
    outcome: 'rejected',
    note: 'Please use the existing staging allocation first.',
  },
  {
    title: 'Social media ad campaign',
    description: 'Two-week paid social campaign for the product launch.',
    amount: '30000',
    quantity: 1,
    category: 'MARKETING',
    department: 'Marketing',
    requester: 'Demo Requester (Marketing)',
    outcome: 'draft',
  },
];

export async function seedDemoData(): Promise<void> {
  const existing = await prisma.purchaseRequest.count();
  if (existing > 0) {
    console.log(`[seed] demo data skipped - ${existing} request(s) already exist`);
    return;
  }

  const departments = new Map(
    (await prisma.department.findMany()).map((department) => [department.name, department.id]),
  );

  for (const demo of DEMO_REQUESTS) {
    const departmentId = departments.get(demo.department);
    if (!departmentId) continue;

    const request = await createPurchaseRequest(
      {
        title: demo.title,
        description: demo.description,
        amount: demo.amount,
        quantity: demo.quantity,
        category: demo.category,
        requesterName: demo.requester,
        departmentId,
        submit: demo.outcome !== 'draft',
      },
      WEB_CONTEXT,
    );

    const approvalId = request.approval?.id;
    if (approvalId && demo.outcome === 'approved') {
      await approveRequest(approvalId, { approverName: 'Demo Approver', comments: demo.note });
    }
    if (approvalId && demo.outcome === 'rejected') {
      await rejectRequest(approvalId, { approverName: 'Demo Approver', reason: demo.note ?? 'Not approved' });
    }
    console.log(`[seed] demo request ${request.reference}: ${demo.outcome}`);
  }
}
