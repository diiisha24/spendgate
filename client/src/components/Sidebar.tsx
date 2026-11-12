import { X } from 'lucide-react';
import { NavLink } from 'react-router';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useHealth } from '@/hooks/useHealth';
import { api } from '@/lib/api';
import { navItems } from '@/lib/navigation';
import { Logo } from './Logo';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function ApiStatus() {
  const health = useHealth();
  const config = {
    loading: { dot: 'bg-ink-subtle', text: 'Checking API…' },
    online: { dot: 'bg-success-600', text: 'API connected' },
    offline: { dot: 'bg-danger-600', text: 'API offline' },
  }[health.state];

  return (
    <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
      <span className={`size-2 rounded-full ${config.dot}`} aria-hidden="true" />
      <span role="status">{config.text}</span>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pending = useApiQuery((signal) => api.listApprovals({ status: 'PENDING', pageSize: 1 }, signal), []);
  const pendingCount = pending.data?.total ?? 0;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-ink/30 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-muted hover:bg-canvas lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-muted hover:bg-canvas hover:text-ink'
                }`
              }
            >
              <Icon className="size-4.5 shrink-0" aria-hidden="true" />
              {label}
              {path === '/approvals' && pendingCount > 0 && (
                <span
                  className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
                  aria-label={`${pendingCount} pending approvals`}
                >
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3">
          <ApiStatus />
        </div>
      </aside>
    </>
  );
}
