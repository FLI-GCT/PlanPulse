import { addDays } from 'date-fns';
import type { PrismaClient } from '../generated/prisma';
import type { OfRecord } from './ordres-fabrication';
import type { AchatRecord } from './achats';

// ─── Helpers ────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Direct component article IDs that PF-001 needs from global achats
const PF_DIRECT_COMPONENTS = [
  'ART-AC-002', // Roue avant
  'ART-AC-003', // Roue arriere
  'ART-AC-004', // Kit freinage
  'ART-AC-005', // Kit eclairage
  'ART-AC-008', // Visserie
  'ART-AC-011', // Bequille
  'ART-AC-012', // Garde-boue
  'ART-AC-013', // Sonnette + reflecteurs
];

// SF composant article IDs for sub-OF -> global achat links
const SF_COMPONENTS: Record<string, string[]> = {
  'ART-SF-001': ['ART-AC-001', 'ART-AC-010', 'ART-AC-009'], // Cadre alu, Grip, Joint
  'ART-SF-002': ['ART-AC-007'],                               // Faisceau electrique
  'ART-SF-003': ['ART-AC-006'],                               // Controleur electronique
};

// Map SF article -> which config keys have specifics
const SF_CONFIG_KEYS: Record<string, string[]> = {
  'ART-SF-001': ['plateau'],
  'ART-SF-002': ['guidon'],
  'ART-SF-003': ['batterie', 'moteur'],
};

// Config keys directly on PF
const PF_CONFIG_KEYS = ['pneu', 'accessoire', 'eclairage'];

interface DependanceRecord {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  typeLien: 'FORT' | 'PARTAGE' | 'NOMENCLATURE';
  quantite: number | null;
  delaiMinimum: number;
}

// ─── Main export ────────────────────────────────────────────

export async function seedDependances(
  prisma: PrismaClient,
  finalOfs: OfRecord[],
  subOfs: OfRecord[],
) {
  const rand = seededRandom(999);
  const dependances: DependanceRecord[] = [];
  const seenEdges = new Set<string>();

  function addDep(dep: DependanceRecord): boolean {
    const key = `${dep.sourceId}->${dep.targetId}`;
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    dependances.push(dep);
    return true;
  }

  // Pre-fetch all achats from DB to build lookup
  const allAchats = await prisma.achat.findMany();

  // Build lookup maps
  const globalAchatsByArticle = new Map<string, typeof allAchats>();
  const specificAchatsByOf = new Map<string, typeof allAchats>();

  for (const achat of allAchats) {
    if (achat.typeLien === 'partage') {
      const list = globalAchatsByArticle.get(achat.articleId) ?? [];
      list.push(achat);
      globalAchatsByArticle.set(achat.articleId, list);
    } else if (achat.typeLien === 'specifique' && achat.ofSpecifiqueId) {
      const list = specificAchatsByOf.get(achat.ofSpecifiqueId) ?? [];
      list.push(achat);
      specificAchatsByOf.set(achat.ofSpecifiqueId, list);
    }
  }

  // Build sub-OF lookup by parentOfId
  const subOfsByParent = new Map<string, OfRecord[]>();
  for (const sub of subOfs) {
    if (sub.parentOfId) {
      const list = subOfsByParent.get(sub.parentOfId) ?? [];
      list.push(sub);
      subOfsByParent.set(sub.parentOfId, list);
    }
  }

  for (const finalOf of finalOfs) {
    const children = subOfsByParent.get(finalOf.id) ?? [];

    // ─── 1. Final OF -> each sub-OF (NOMENCLATURE) ─────
    for (const subOf of children) {
      addDep({
        sourceType: 'of',
        sourceId: finalOf.id,
        targetType: 'of',
        targetId: subOf.id,
        typeLien: 'NOMENCLATURE',
        quantite: finalOf.quantite,
        delaiMinimum: 0,
      });
    }

    // ─── 2. Sub-OF -> global achats for sub-OF's components (PARTAGE) ─
    for (const subOf of children) {
      const componentArticles = SF_COMPONENTS[subOf.articleId] ?? [];

      for (const compArticleId of componentArticles) {
        const globalAchats = globalAchatsByArticle.get(compArticleId) ?? [];
        // Round-robin assign to spread across multiple achats
        if (globalAchats.length > 0) {
          const achat = globalAchats[Math.floor(rand() * globalAchats.length)];
          addDep({
            sourceType: 'of',
            sourceId: subOf.id,
            targetType: 'achat',
            targetId: achat.id,
            typeLien: 'PARTAGE',
            quantite: finalOf.quantite,
            delaiMinimum: 0,
          });
        }
      }

      // ─── 3. Sub-OF -> specific achats (FORT) ──────────
      const configKeys = SF_CONFIG_KEYS[subOf.articleId] ?? [];
      const config = finalOf.config as Record<string, string> | null;

      if (config) {
        for (const key of configKeys) {
          if (config[key]) {
            // Find the specific achat for this OF and article
            const specificAchats = specificAchatsByOf.get(finalOf.id) ?? [];
            const matchingAchat = specificAchats.find(
              (a) => a.articleId === config[key],
            );
            if (matchingAchat) {
              addDep({
                sourceType: 'of',
                sourceId: subOf.id,
                targetType: 'achat',
                targetId: matchingAchat.id,
                typeLien: 'FORT',
                quantite: finalOf.quantite,
                delaiMinimum: 0,
              });
            }
          }
        }
      }
    }

    // ─── 4. Final OF -> global achats for direct components (PARTAGE) ─
    for (const compArticleId of PF_DIRECT_COMPONENTS) {
      const globalAchats = globalAchatsByArticle.get(compArticleId) ?? [];
      if (globalAchats.length > 0) {
        const achat = globalAchats[Math.floor(rand() * globalAchats.length)];
        addDep({
          sourceType: 'of',
          sourceId: finalOf.id,
          targetType: 'achat',
          targetId: achat.id,
          typeLien: 'PARTAGE',
          quantite: finalOf.quantite,
          delaiMinimum: 0,
        });
      }
    }

    // ─── 5. Final OF -> specific achats for PF-level options (FORT) ──
    const config = finalOf.config as Record<string, string> | null;
    if (config) {
      for (const key of PF_CONFIG_KEYS) {
        if (config[key]) {
          const specificAchats = specificAchatsByOf.get(finalOf.id) ?? [];
          const matchingAchat = specificAchats.find(
            (a) => a.articleId === config[key],
          );
          if (matchingAchat) {
            addDep({
              sourceType: 'of',
              sourceId: finalOf.id,
              targetType: 'achat',
              targetId: matchingAchat.id,
              typeLien: 'FORT',
              quantite: finalOf.quantite,
              delaiMinimum: 0,
            });
          }
        }
      }
    }
  }

  // ─── Inject problem: Violated temporal constraints ────
  // Pick 4-5 dependances and set delaiMinimum such that the constraint is violated
  // (i.e., source dateDebutPrevue < target dateFinPrevue + delai)
  const ofLookup = new Map<string, OfRecord>();
  for (const of_ of [...finalOfs, ...subOfs]) {
    ofLookup.set(of_.id, of_);
  }

  let violationCount = 0;
  for (const dep of dependances) {
    if (violationCount >= 5) break;
    if (dep.sourceType !== 'of' || dep.targetType !== 'of') continue;
    if (dep.typeLien !== 'NOMENCLATURE') continue;

    const sourceOf = ofLookup.get(dep.sourceId);
    const targetOf = ofLookup.get(dep.targetId);
    if (!sourceOf || !targetOf) continue;
    if (sourceOf.statut === 'TERMINE' || sourceOf.statut === 'ANNULE') continue;

    // Set a delaiMinimum that will be violated by the current dates
    // The constraint: sourceOf.dateDebutPrevue >= targetOf.dateFinPrevue + delaiMinimum
    // To violate: make delaiMinimum large enough
    const daysBetween = Math.floor(
      (sourceOf.dateDebutPrevue.getTime() - targetOf.dateFinPrevue.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (daysBetween < 5) {
      // Set delaiMinimum to something larger than daysBetween to create violation
      dep.delaiMinimum = daysBetween + 3;
      violationCount++;
    }
  }

  // ─── Bulk insert ──────────────────────────────────────────
  for (const dep of dependances) {
    await prisma.dependance.create({
      data: {
        sourceType: dep.sourceType,
        sourceId: dep.sourceId,
        targetType: dep.targetType,
        targetId: dep.targetId,
        typeLien: dep.typeLien,
        quantite: dep.quantite,
        delaiMinimum: dep.delaiMinimum,
      },
    });
  }

  console.log(`  -> ${dependances.length} dependances created`);
  console.log(
    `  -> ${violationCount} violated temporal constraints injected`,
  );

  return dependances;
}
