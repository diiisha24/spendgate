import type { ApproverRole } from '@prisma/client';
import { toMinorUnits } from '../lib/money.js';
import { env } from './env.js';

/**
 * MVP approval routing (thresholds configurable via env, in whole rupees):
 *   amount <  APPROVAL_TEAM_LEAD_BELOW            -> TEAM_LEAD
 *   amount <= APPROVAL_DEPARTMENT_MANAGER_UP_TO   -> DEPARTMENT_MANAGER
 *   amount >  APPROVAL_DEPARTMENT_MANAGER_UP_TO   -> FINANCE_MANAGER
 * Defaults: below ₹10,000 / ₹10,000–₹50,000 / above ₹50,000.
 */
const teamLeadBelowMinor = toMinorUnits(env.APPROVAL_TEAM_LEAD_BELOW);
const departmentManagerUpToMinor = toMinorUnits(env.APPROVAL_DEPARTMENT_MANAGER_UP_TO);

if (teamLeadBelowMinor > departmentManagerUpToMinor) {
  throw new Error(
    'Invalid approval thresholds: APPROVAL_TEAM_LEAD_BELOW must not exceed APPROVAL_DEPARTMENT_MANAGER_UP_TO',
  );
}

export const approvalThresholds = Object.freeze({
  teamLeadBelowMinor,
  departmentManagerUpToMinor,
});

export function resolveApproverRole(amountMinor: bigint): ApproverRole {
  if (amountMinor < teamLeadBelowMinor) return 'TEAM_LEAD';
  if (amountMinor <= departmentManagerUpToMinor) return 'DEPARTMENT_MANAGER';
  return 'FINANCE_MANAGER';
}

export const APPROVER_ROLE_LABELS: Record<ApproverRole, string> = {
  TEAM_LEAD: 'Team Lead',
  DEPARTMENT_MANAGER: 'Department Manager',
  FINANCE_MANAGER: 'Finance Manager',
};
