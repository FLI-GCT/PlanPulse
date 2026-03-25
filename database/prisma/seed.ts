import { config } from 'dotenv';
// Load .env from project root (one level up from database/)
config({ path: '../.env' });

import { PrismaClient } from '../generated/prisma';

import { seedArticles } from '../seeds/articles';
import { seedNomenclatures } from '../seeds/nomenclatures';
import { seedOrdresFabrication } from '../seeds/ordres-fabrication';
import { seedAchats } from '../seeds/achats';
import { seedDependances } from '../seeds/dependances';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning database...');

  // Delete all in reverse FK order to avoid constraint violations
  await prisma.$transaction([
    prisma.alerte.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.cacheAllocation.deleteMany(),
    prisma.cacheMarge.deleteMany(),
    prisma.dependance.deleteMany(),
    prisma.achat.deleteMany(),
    prisma.ordreFabrication.deleteMany(),
    prisma.nomenclature.deleteMany(),
    prisma.article.deleteMany(),
    prisma.scenario.deleteMany(),
  ]);

  console.log('  -> All tables cleared');

  // Insert in FK order
  console.log('\nSeeding articles...');
  const articles = await seedArticles(prisma);

  console.log('\nSeeding nomenclatures...');
  await seedNomenclatures(prisma);

  console.log('\nSeeding ordres de fabrication...');
  const { ofs, subOfs } = await seedOrdresFabrication(prisma);

  console.log('\nSeeding achats...');
  await seedAchats(prisma, ofs);

  console.log('\nSeeding dependances...');
  await seedDependances(prisma, ofs, subOfs);

  // Print summary
  const counts = await prisma.$transaction([
    prisma.article.count(),
    prisma.nomenclature.count(),
    prisma.ordreFabrication.count(),
    prisma.achat.count(),
    prisma.dependance.count(),
  ]);

  console.log('\n========================================');
  console.log('Seed complete!');
  console.log('========================================');
  console.log(`  Articles:        ${counts[0]}`);
  console.log(`  Nomenclatures:   ${counts[1]}`);
  console.log(`  OFs:             ${counts[2]}`);
  console.log(`  Achats:          ${counts[3]}`);
  console.log(`  Dependances:     ${counts[4]}`);
  console.log('========================================');
}

main()
  .catch((e: unknown) => {
    console.error('Seed failed:', e);
    // eslint-disable-next-line no-process-exit
    (globalThis as any).process?.exit(1);
  })
  .finally(() => prisma.$disconnect());
