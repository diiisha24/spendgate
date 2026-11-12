import {
  CheckCircle2,
  FileText,
  LayoutDashboard,
  PiggyBank,
  ScrollText,
  Settings,
} from 'lucide-react';
import type { NavItem } from '@/types';

export const navItems: NavItem[] = [
  { label: 'Overview', path: '/', icon: LayoutDashboard },
  { label: 'Purchase Requests', path: '/purchase-requests', icon: FileText },
  { label: 'Budgets', path: '/budgets', icon: PiggyBank },
  { label: 'Approvals', path: '/approvals', icon: CheckCircle2 },
  { label: 'Audit Logs', path: '/audit-logs', icon: ScrollText },
  { label: 'Settings', path: '/settings', icon: Settings },
];
