import { env } from '../config/env.js';
import { toMinorUnits } from '../lib/money.js';
import { disconnectDatabase, prisma } from './prisma.js';
import { seedDemoData } from './seedDemo.js';

/**
 * Idempotent seed: safe to run repeatedly. Upserts by unique department name
 * and resets the allocated budget to the seed value.
 */
const departments = [
  { name: 'Engineering', allocatedBudget: toMinorUnits('200000') },
  { name: 'Marketing', allocatedBudget: toMinorUnits('150000') },
  { name: 'Operations', allocatedBudget: toMinorUnits('150000') },
] as const;

async function seed(): Promise<void> {
  console.log(`[seed] environment: ${env.NODE_ENV}`);

  for (const dept of departments) {
    const record = await prisma.department.upsert({
      where: { name: dept.name },
      update: { allocatedBudget: dept.allocatedBudget },
      create: { name: dept.name, allocatedBudget: dept.allocatedBudget },
    });
    console.log(`[seed] department ready: ${record.name} (${record.id})`);
  }

  const count = await prisma.department.count();
  console.log(`[seed] done - ${count} department(s) in database`);

  if (env.SEED_DEMO_DATA) {
    await seedDemoData();
  }
}

seed()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
