import { createBrowserRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/Toast';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { PurchaseRequestDetailPage } from '@/pages/PurchaseRequestDetailPage';
import { PurchaseRequestFormPage } from '@/pages/PurchaseRequestFormPage';
import { PurchaseRequestsPage } from '@/pages/PurchaseRequestsPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'purchase-requests', element: <PurchaseRequestsPage /> },
      { path: 'purchase-requests/new', element: <PurchaseRequestFormPage /> },
      { path: 'purchase-requests/:id', element: <PurchaseRequestDetailPage /> },
      { path: 'purchase-requests/:id/edit', element: <PurchaseRequestFormPage key="edit" /> },
      { path: 'budgets', element: <BudgetsPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
      {
        path: 'settings',
        element: (
          <PlaceholderPage
            title="Settings"
            description="Organization, approval levels and integration settings."
          />
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
