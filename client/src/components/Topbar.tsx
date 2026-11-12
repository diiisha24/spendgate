import { Bell, ChevronDown, Menu, Search } from 'lucide-react';
import { CURRENT_USER } from '@/lib/session';
import { Logo } from './Logo';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-1.5 text-ink-muted hover:bg-canvas lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="lg:hidden">
        <Logo />
      </div>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search requests, departments…"
          aria-label="Search (coming soon)"
          disabled
          className="w-full rounded-lg border border-line bg-canvas py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle disabled:cursor-not-allowed"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="relative rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-600 ring-2 ring-surface" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-canvas"
          aria-label="Account menu"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {CURRENT_USER.initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-ink">{CURRENT_USER.name}</span>
            <span className="block text-xs leading-tight text-ink-subtle">{CURRENT_USER.role}</span>
          </span>
          <ChevronDown className="hidden size-4 text-ink-subtle sm:block" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
