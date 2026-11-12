/**
 * Money helpers. All monetary values are persisted as BigInt minor units
 * (paise for INR). Never use floating-point arithmetic on stored amounts.
 */

export const DEFAULT_CURRENCY = 'INR';
const MINOR_UNITS_PER_MAJOR = 100n;

/**
 * Converts a major-unit amount (e.g. rupees, as a string or integer) into
 * minor units. Accepts at most two decimal places and rejects anything else
 * to avoid silent rounding.
 */
export function toMinorUnits(major: string | number): bigint {
  const text = typeof major === 'number' ? major.toString() : major.trim();

  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    throw new RangeError(`Invalid monetary amount: "${text}"`);
  }

  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');
  const minor = BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(fraction.padEnd(2, '0'));

  return negative ? -minor : minor;
}

/** Formats minor units as a major-unit decimal string, e.g. 20000000n -> "200000.00". */
export function toMajorString(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_UNITS_PER_MAJOR;
  const fraction = (abs % MINOR_UNITS_PER_MAJOR).toString().padStart(2, '0');

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

const inrDisplay = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Human-readable INR string, e.g. 2500000n -> "₹25,000.00". Display only:
 * built from the exact decimal string, never used for arithmetic.
 */
export function formatINR(minor: bigint): string {
  return inrDisplay.format(Number(toMajorString(minor)));
}

/** JSON-safe representation for API/MCP responses. */
export interface MoneyDto {
  /** Minor units as a string (BigInt is not JSON-serializable). */
  minor: string;
  /** Major units as a fixed two-decimal string. */
  major: string;
  currency: string;
  /** Formatted for humans, e.g. "₹20,000.00". */
  display: string;
}

export function toMoneyDto(minor: bigint, currency: string = DEFAULT_CURRENCY): MoneyDto {
  return { minor: minor.toString(), major: toMajorString(minor), currency, display: formatINR(minor) };
}
