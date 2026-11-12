import { ArrowLeft, Check, Pencil, Send, Trash2, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApprovalDialog, type ApprovalTarget } from '@/components/ApprovalDialog';
import { AuditTimeline } from '@/components/AuditTimeline';
import { Card } from '@/components/Card';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { RoleBadge, StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { Button, ErrorState, LoadingState } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApiQuery';
import { api, errorMessage } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/constants';
import { formatDateTime, formatMoney } from '@/lib/format';
import { CURRENT_USER } from '@/lib/session';

export function PurchaseRequestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: request, error, loading, reload } = useApiQuery((signal) => api.getRequest(id, signal), [id]);

  const [busy, setBusy] = useState<'submit' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dialog, setDialog] = useState<{ target: ApprovalTarget; mode: 'approve' | 'reject' } | null>(null);

  if (loading) return <LoadingState label="Loading request…" />;
  if (error || !request) return <ErrorState message={error ?? 'Request not found'} onRetry={reload} />;

  const pendingApproval = request.approval?.status === 'PENDING' ? request.approval : null;
  const canEdit = request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL';

  const handleSubmit = async () => {
    setBusy('submit');
    try {
      const updated = await api.submitRequest(request.id, CURRENT_USER.name);
      toast.success(`${updated.reference} submitted to ${updated.approval?.approverRoleLabel ?? 'approver'}`);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete');
    try {
      await api.deleteRequest(request.id, CURRENT_USER.name);
      toast.success(`${request.reference} deleted`);
      navigate('/purchase-requests');
    } catch (caught) {
      toast.error(errorMessage(caught));
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  const openDialog = (mode: 'approve' | 'reject') => {
    if (!pendingApproval) return;
    setDialog({
      mode,
      target: {
        approvalId: pendingApproval.id,
        reference: request.reference,
        title: request.title,
        amount: request.amount,
        approverRole: pendingApproval.approverRole,
      },
    });
  };

  return (
    <>
      <Link to="/purchase-requests" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" /> All requests
      </Link>

      <PageHeader
        title={request.title}
        description={`${request.reference} · ${request.department.name} · requested by ${request.requesterName}`}
        actions={
          <>
            {canEdit && (
              <Link
                to={`/purchase-requests/${request.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-card hover:bg-canvas"
              >
                <Pencil className="size-4" aria-hidden="true" /> Edit
              </Link>
            )}
            {request.status === 'DRAFT' && (
              <>
                <Button
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy !== null}
                >
                  Delete
                </Button>
                <Button
                  icon={<Send className="size-4" />}
                  loading={busy === 'submit'}
                  disabled={busy !== null}
                  onClick={() => void handleSubmit()}
                >
                  Submit for approval
                </Button>
              </>
            )}
            {pendingApproval && (
              <>
                <Button variant="secondary" icon={<X className="size-4" />} onClick={() => openDialog('reject')}>
                  Reject
                </Button>
                <Button variant="success" icon={<Check className="size-4" />} onClick={() => openDialog('approve')}>
                  Approve
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Request details">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Detail label="Status"><StatusBadge status={request.status} /></Detail>
              <Detail label="Amount">
                <span className="text-base font-semibold tabular-nums">{formatMoney(request.amount)}</span>
              </Detail>
              <Detail label="Quantity">{request.quantity}</Detail>
              <Detail label="Category">{CATEGORY_LABELS[request.category]}</Detail>
              <Detail label="Department">{request.department.name}</Detail>
              <Detail label="Requester">{request.requesterName}</Detail>
              <Detail label="Created">{formatDateTime(request.createdAt)}</Detail>
              <Detail label="Submitted">{request.submittedAt ? formatDateTime(request.submittedAt) : '—'}</Detail>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-ink">{request.description || '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Activity" description="Audit trail for this request">
            <AuditTimeline logs={request.history} />
          </Card>
        </div>

        <Card title="Approval">
          {!request.approval ? (
            <p className="text-sm text-ink-muted">
              This request is a draft. Submit it to route it to the right approver.
            </p>
          ) : (
            <dl className="space-y-3 text-sm">
              <Detail label="Routed to"><RoleBadge role={request.approval.approverRole} /></Detail>
              <Detail label="Decision">
                <span
                  className={
                    request.approval.status === 'APPROVED'
                      ? 'font-medium text-success-600'
                      : request.approval.status === 'REJECTED'
                        ? 'font-medium text-danger-600'
                        : 'font-medium text-warning-600'
                  }
                >
                  {request.approval.status === 'PENDING' ? 'Awaiting decision' : request.approval.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                </span>
              </Detail>
              {request.approval.approverName && <Detail label="Decided by">{request.approval.approverName}</Detail>}
              {request.approval.decidedAt && <Detail label="Decided at">{formatDateTime(request.approval.decidedAt)}</Detail>}
              {request.approval.comments && (
                <Detail label={request.approval.status === 'REJECTED' ? 'Rejection reason' : 'Comments'}>
                  <span className="whitespace-pre-wrap">{request.approval.comments}</span>
                </Detail>
              )}
            </dl>
          )}
        </Card>
      </div>

      <ApprovalDialog target={dialog?.target ?? null} mode={dialog?.mode ?? 'approve'} onClose={() => setDialog(null)} />

      <Modal
        open={confirmDelete}
        onClose={() => busy === null && setConfirmDelete(false)}
        title="Delete draft?"
        description={`${request.reference} will be permanently removed. This is recorded in the audit log.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={() => void handleDelete()}>
              Delete draft
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Only drafts can be deleted. Submitted requests are retained for audit.</p>
      </Modal>
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}
