import type { Money } from '@/types';

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats rupees using the Indian numbering system, e.g. 500000 -> "₹5,00,000". */
export function formatINR(amount: number): string {
  return inrWhole.format(amount);
}

/**
 * Formats an API Money value for display. Paise are shown only when non-zero.
 * Display-only: arithmetic on money always happens on the server.
 */
export function formatMoney(money: Money): string {
  const value = Number(money.major);
  return money.minor.endsWith('00') ? inrWhole.format(value) : inrExact.format(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formats an ISO date as DD MMM YYYY, e.g. "12 Nov 2026". */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** Formats an ISO timestamp as "12 Nov 2026, 14:05". */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}
