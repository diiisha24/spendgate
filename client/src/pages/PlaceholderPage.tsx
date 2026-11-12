import { Construction } from 'lucide-react';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

/** Shell for sections that will be implemented in later phases. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Construction className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-ink">Coming in a later phase</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            This section is part of the dashboard shell. Functionality will be connected to the
            backend services in an upcoming release.
          </p>
        </div>
      </Card>
    </>
  );
}
