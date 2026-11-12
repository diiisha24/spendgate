import { z } from 'zod';

/** Upper bound for a single request: ₹10,00,00,000 (10 crore). */
export const MAX_AMOUNT_RUPEES = 100_000_000;

/** Person name / actor identity (no auth in the MVP - supplied by the caller). */
export const personName = z
  .string()
  .trim()
  .min(2, 'Must be at least 2 characters')
  .max(80, 'Must be at most 80 characters');

/**
 * Monetary amount in rupees, accepted as a string (preferred) or number.
 * Parsed to a canonical decimal string; conversion to paise happens in the
 * service via toMinorUnits so floats never touch stored values.
 */
export const rupeeAmount = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toString() : value.trim()))
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
    message: 'Amount must be a positive number with at most 2 decimal places',
  })
  .refine((value) => Number(value) > 0, { message: 'Amount must be greater than zero' })
  .refine((value) => Number(value) <= MAX_AMOUNT_RUPEES, {
    message: `Amount must not exceed ${MAX_AMOUNT_RUPEES} rupees`,
  });

export const idParam = z.object({ id: z.string().trim().min(1).max(64) });

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
