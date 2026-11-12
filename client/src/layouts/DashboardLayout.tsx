import { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        {DEMO_MODE && (
          <div
            role="note"
            className="border-b border-warning-600/20 bg-warning-50 px-4 py-2 text-center text-xs text-warning-600 sm:px-6"
          >
            Demo environment: all departments, requests and names are fictional. Data resets when the
            server restarts. Payments and Volopay card issuance are not connected.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
