import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { CURRENT_USER } from '@/lib/session';
import type { ApproverRole, Money } from '@/types';
import { Modal } from './Modal';
import { RoleBadge } from './StatusBadge';
import { useToast } from './Toast';
import { Button, Field, Input, Textarea } from './ui';

export interface ApprovalTarget {
  approvalId: string;
  reference: string;
  title: string;
  amount: Money;
  approverRole: ApproverRole;
}

interface ApprovalDialogProps {
  target: ApprovalTarget | null;
  mode: 'approve' | 'reject';
  onClose: () => void;
}

const MIN_REASON_LENGTH = 5;

export function ApprovalDialog({ target, mode, onClose }: ApprovalDialogProps) {
  const toast = useToast();
  const [approverName, setApproverName] = useState<string>(CURRENT_USER.name);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setNote('');
      setTouched(false);
      setServerError(null);
    }
  }, [target, mode]);

  const isReject = mode === 'reject';
  const nameError = approverName.trim().length < 2 ? 'Approver name is required' : undefined;
  const reasonError =
    isReject && note.trim().length < MIN_REASON_LENGTH
      ? `A rejection reason of at least ${MIN_REASON_LENGTH} characters is required`
      : undefined;

  const handleSubmit = async () => {
    setTouched(true);
    if (!target || nameError || reasonError) return;
    setSubmitting(true);
    setServerError(null);
    try {
      if (isReject) {
        await api.reject(target.approvalId, { approverName: approverName.trim(), reason: note.trim() });
        toast.success(`${target.reference} rejected`);
      } else {
        await api.approve(target.approvalId, {
          approverName: approverName.trim(),
          comments: note.trim() || undefined,
        });
        toast.success(`${target.reference} approved`);
      }
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      onClose={submitting ? () => undefined : onClose}
      title={isReject ? 'Reject request' : 'Approve request'}
      description={target ? `${target.reference} · ${target.title}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isReject ? 'danger' : 'success'}
            loading={submitting}
            onClick={() => void handleSubmit()}
          >
            {isReject ? 'Reject request' : 'Approve request'}
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2.5 text-sm">
            <span className="font-semibold tabular-nums text-ink">{formatMoney(target.amount)}</span>
            <RoleBadge role={target.approverRole} />
          </div>

          {serverError && (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
              {serverError}
            </p>
          )}

          <Field label="Approver name" htmlFor="approverName" required error={touched ? nameError : undefined}>
            <Input
              id="approverName"
              value={approverName}
              onChange={(event) => setApproverName(event.target.value)}
              invalid={touched && !!nameError}
              maxLength={80}
            />
          </Field>

          <Field
            label={isReject ? 'Rejection reason' : 'Comments (optional)'}
            htmlFor="approvalNote"
            required={isReject}
            error={touched ? reasonError : undefined}
            hint={isReject ? 'Shared with the requester and stored in the audit log.' : undefined}
          >
            <Textarea
              id="approvalNote"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              invalid={touched && !!reasonError}
              maxLength={1000}
              placeholder={isReject ? 'Explain why this request is being rejected' : 'Add a note for the requester'}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
