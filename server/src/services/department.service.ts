import type { Department } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * Resolves a department from a human-entered name (used by MCP, where users
 * say "engineering" rather than an id). Matches case-insensitively on the
 * exact name first, then on a unique prefix ("eng" -> Engineering).
 */
export async function resolveDepartmentByName(name: string): Promise<Department> {
  const needle = name.trim().toLowerCase();
  if (!needle) throw AppError.badRequest('Department name is required');

  // The department list is small; matching in memory keeps this DB-agnostic
  // (SQLite has no case-insensitive equality in Prisma).
  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  const exact = departments.find((department) => department.name.toLowerCase() === needle);
  if (exact) return exact;

  const prefixMatches = departments.filter((department) =>
    department.name.toLowerCase().startsWith(needle),
  );
  if (prefixMatches.length === 1 && prefixMatches[0]) return prefixMatches[0];

  const available = departments.map((department) => department.name);
  throw AppError.notFound(
    prefixMatches.length > 1
      ? `Department name "${name}" is ambiguous. Choose one of: ${prefixMatches.map((d) => d.name).join(', ')}`
      : `Department "${name}" not found. Available departments: ${available.join(', ')}`,
    { availableDepartments: available },
  );
}
