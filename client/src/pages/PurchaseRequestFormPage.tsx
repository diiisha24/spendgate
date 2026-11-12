import { ArrowLeft, Send } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Button, ErrorState, Field, Input, LoadingState, Select, Textarea } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ApiError, api, errorMessage } from '@/lib/api';
import { CATEGORY_OPTIONS, ROLE_LABELS } from '@/lib/constants';
import { formatMoney } from '@/lib/format';
import { CURRENT_USER } from '@/lib/session';
import type { DashboardSummary, Money, PurchaseCategory, PurchaseRequestDetail } from '@/types';

interface FormValues {
  title: string;
  description: string;
  amount: string;
  quantity: string;
  category: PurchaseCategory | '';
  requesterName: string;
  departmentId: string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = {
  title: '',
  description: '',
  amount: '',
  quantity: '1',
  category: '',
  requesterName: CURRENT_USER.name,
  departmentId: '',
};

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Client-side checks for fast feedback only - the server re-validates everything. */
function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.title.trim().length < 3) errors.title = 'Title must be at least 3 characters';
  if (!AMOUNT_PATTERN.test(values.amount.trim()) || Number(values.amount) <= 0) {
    errors.amount = 'Enter a positive amount with at most 2 decimal places';
  }
  const quantity = Number(values.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = 'Quantity must be a whole number ≥ 1';
  if (!values.category) errors.category = 'Select a category';
  if (values.requesterName.trim().length < 2) errors.requesterName = 'Requester name is required';
  if (!values.departmentId) errors.departmentId = 'Select a department';
  return errors;
}

/** Preview only, mirrors the server's routing rules for user guidance. */
function previewRole(amount: string, rules: DashboardSummary['approvalRules'] | undefined): string | null {
  if (!rules || !AMOUNT_PATTERN.test(amount.trim())) return null;
  const value = Number(amount);
  if (value <= 0) return null;
  if (value < Number(rules.teamLeadBelow.major)) return ROLE_LABELS.TEAM_LEAD;
  if (value <= Number(rules.departmentManagerUpTo.major)) return ROLE_LABELS.DEPARTMENT_MANAGER;
  return ROLE_LABELS.FINANCE_MANAGER;
}

function toFormValues(request: PurchaseRequestDetail): FormValues {
  return {
    title: request.title,
    description: request.description ?? '',
    amount: request.amount.major.replace(/\.00$/, ''),
    quantity: String(request.quantity),
    category: request.category,
    requesterName: request.requesterName,
    departmentId: request.department.id,
  };
}

export function PurchaseRequestFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<{ message: string; shortfall?: Money } | null>(null);
  const [submitting, setSubmitting] = useState<'draft' | 'submit' | 'save' | null>(null);

  const dashboard = useApiQuery((signal) => api.dashboard(signal), []);
  const existing = useApiQuery(
    (signal) => (id ? api.getRequest(id, signal) : Promise.resolve(undefined)),
    [id],
  );

  useEffect(() => {
    if (existing.data) setValues(toFormValues(existing.data));
  }, [existing.data]);

  const departments = dashboard.data?.departments ?? [];
  const selectedDepartment = departments.find((department) => department.id === values.departmentId);
  const routedTo = useMemo(
    () => previewRole(values.amount, dashboard.data?.approvalRules),
    [values.amount, dashboard.data?.approvalRules],
  );

  const setField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (mode: 'draft' | 'submit' | 'save') => {
    const validation = validate(values);
    setErrors(validation);
    setServerError(null);
    if (Object.keys(validation).length > 0) return;

    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      amount: values.amount.trim(),
      quantity: Number(values.quantity),
      category: values.category as PurchaseCategory,
      requesterName: values.requesterName.trim(),
      departmentId: values.departmentId,
    };

    setSubmitting(mode);
    try {
      const saved =
        isEdit && id
          ? await api.updateRequest(id, { ...payload, performedBy: CURRENT_USER.name })
          : await api.createRequest({ ...payload, submit: mode === 'submit' });

      toast.success(
        isEdit
          ? `${saved.reference} updated`
          : mode === 'submit'
            ? `${saved.reference} submitted for approval`
            : `${saved.reference} saved as draft`,
      );
      navigate(`/purchase-requests/${saved.id}`);
    } catch (error) {
      const shortfall =
        error instanceof ApiError && error.code === 'BUDGET_EXCEEDED'
          ? (error.details as { shortfall?: Money } | undefined)?.shortfall
          : undefined;
      setServerError({ message: errorMessage(error), shortfall });
    } finally {
      setSubmitting(null);
    }
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmit(isEdit ? 'save' : 'submit');
  };

  if (isEdit && existing.loading) return <LoadingState label="Loading request…" />;
  if (isEdit && existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  const locked =
    isEdit && existing.data && !['DRAFT', 'PENDING_APPROVAL'].includes(existing.data.status);

  return (
    <>
      <Link
        to={isEdit && id ? `/purchase-requests/${id}` : '/purchase-requests'}
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </Link>
      <PageHeader
        title={isEdit ? `Edit ${existing.data?.reference ?? 'request'}` : 'New purchase request'}
        description={
          isEdit && existing.data?.status === 'PENDING_APPROVAL'
            ? 'This request is pending approval. Changes are re-validated against the budget and may change the approver.'
            : 'Budget availability and approval routing are verified by the server on submission.'
        }
      />

      {locked ? (
        <ErrorState message="This request has been processed and can no longer be edited." />
      ) : (
        <form onSubmit={onFormSubmit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {serverError && (
                <div role="alert" className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-600 sm:col-span-2">
                  <p className="font-medium">{serverError.message}</p>
                  {serverError.shortfall && (
                    <p className="mt-0.5">Shortfall: {formatMoney(serverError.shortfall)}</p>
                  )}
                </div>
              )}

              <Field label="Title" htmlFor="title" required error={errors.title} className="sm:col-span-2">
                <Input
                  id="title"
                  value={values.title}
                  onChange={(event) => setField('title', event.target.value)}
                  invalid={!!errors.title}
                  maxLength={120}
                  placeholder="e.g. Design tool licenses"
                />
              </Field>

              <Field label="Description" htmlFor="description" className="sm:col-span-2">
                <Textarea
                  id="description"
                  rows={3}
                  value={values.description}
                  onChange={(event) => setField('description', event.target.value)}
                  maxLength={2000}
                  placeholder="Business justification, vendor, delivery details"
                />
              </Field>

              <Field
                label="Total amount (INR)"
                htmlFor="amount"
                required
                error={errors.amount}
                hint={routedTo ? `Will be routed to: ${routedTo}` : undefined}
              >
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(event) => setField('amount', event.target.value)}
                  invalid={!!errors.amount}
                  placeholder="20000"
                />
              </Field>

              <Field label="Quantity" htmlFor="quantity" required error={errors.quantity}>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={values.quantity}
                  onChange={(event) => setField('quantity', event.target.value)}
                  invalid={!!errors.quantity}
                />
              </Field>

              <Field label="Category" htmlFor="category" required error={errors.category}>
                <Select
                  id="category"
                  value={values.category}
                  onChange={(event) => setField('category', event.target.value as PurchaseCategory | '')}
                  invalid={!!errors.category}
                >
                  <option value="">Select category</option>
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Department" htmlFor="departmentId" required error={errors.departmentId}>
                <Select
                  id="departmentId"
                  value={values.departmentId}
                  onChange={(event) => setField('departmentId', event.target.value)}
                  invalid={!!errors.departmentId}
                  disabled={dashboard.loading}
                >
                  <option value="">{dashboard.loading ? 'Loading…' : 'Select department'}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Requester name"
                htmlFor="requesterName"
                required
                error={errors.requesterName}
                className="sm:col-span-2"
              >
                <Input
                  id="requesterName"
                  value={values.requesterName}
                  onChange={(event) => setField('requesterName', event.target.value)}
                  invalid={!!errors.requesterName}
                  maxLength={80}
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              {isEdit ? (
                <Button type="submit" loading={submitting === 'save'} disabled={submitting !== null}>
                  Save changes
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    loading={submitting === 'draft'}
                    disabled={submitting !== null}
                    onClick={() => void handleSubmit('draft')}
                  >
                    Save as draft
                  </Button>
                  <Button
                    type="submit"
                    icon={<Send className="size-4" />}
                    loading={submitting === 'submit'}
                    disabled={submitting !== null}
                  >
                    Submit for approval
                  </Button>
                </>
              )}
            </div>
          </Card>

          <Card title="Department budget" description="Live figures from the server">
            {!selectedDepartment ? (
              <p className="text-sm text-ink-muted">Select a department to see its available budget.</p>
            ) : (
              <dl className="space-y-3 text-sm">
                {[
                  ['Allocated', selectedDepartment.allocated],
                  ['Committed', selectedDepartment.committed],
                  ['Available', selectedDepartment.available],
                ].map(([label, money]) => (
                  <div key={label as string} className="flex justify-between">
                    <dt className="text-ink-muted">{label as string}</dt>
                    <dd className="font-medium tabular-nums text-ink">{formatMoney(money as Money)}</dd>
                  </div>
                ))}
                <p className="border-t border-line pt-3 text-xs text-ink-subtle">
                  Pending and approved requests count as committed spend. Final validation happens on
                  submission.
                </p>
              </dl>
            )}
          </Card>
        </form>
      )}
    </>
  );
}
