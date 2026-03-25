import { addDays, addWeeks, startOfWeek } from 'date-fns';
import type { PrismaClient } from '../generated/prisma';

// ─── Helpers ────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(min: number, max: number, rand: () => number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// ─── Constants ──────────────────────────────────────────────

const CLIENTS = [
  'Urban Riders',
  'GreenScoot',
  'CityFleet',
  'TechBike',
  'SpeedElec',
  'EcoMove',
  'VoltRide',
  'FlashWheel',
  'SwiftGo',
  'PureDrive',
  'MobiCity',
  'ZenScoot',
  'AgilePulse',
  'NovaDrive',
  'SmartRoll',
];

interface OfConfig {
  [key: string]: string | undefined;
  plateau?: string;
  guidon?: string;
  batterie?: string;
  moteur?: string;
  pneu?: string;
  accessoire?: string;
  eclairage?: string;
}

// ─── Generate config with probabilities ─────────────────────

function generateConfig(rand: () => number): OfConfig {
  const config: OfConfig = {};

  // 30% plateau couleur
  if (rand() < 0.3) {
    const plateauOptions = ['ART-AS-001', 'ART-AS-002', 'ART-AS-003'];
    config.plateau = pick(plateauOptions, rand);
  }

  // 25% batterie 48V, else 75% of remainder gets 36V (so ~56% 36V)
  if (rand() < 0.25) {
    config.batterie = 'ART-AS-006';
  } else if (rand() < 0.75) {
    config.batterie = 'ART-AS-007';
  }

  // 20% moteur 500W, else 60% of remainder gets 350W (so ~48% 350W)
  if (rand() < 0.2) {
    config.moteur = 'ART-AS-008';
  } else if (rand() < 0.6) {
    config.moteur = 'ART-AS-009';
  }

  // 15% guidon sport, else 20% of remainder gets confort
  if (rand() < 0.15) {
    config.guidon = 'ART-AS-004';
  } else if (rand() < 0.2) {
    config.guidon = 'ART-AS-005';
  }

  // 10% pneu tout-terrain
  if (rand() < 0.1) {
    config.pneu = 'ART-AS-010';
  }

  // 8% porte-bagages
  if (rand() < 0.08) {
    config.accessoire = 'ART-AS-011';
  }

  // 8% eclairage premium
  if (rand() < 0.08) {
    config.eclairage = 'ART-AS-012';
  }

  return config;
}

// ─── Statut assignment ──────────────────────────────────────

type StatutOf = 'PLANIFIE' | 'EN_COURS' | 'TERMINE' | 'EN_RETARD' | 'ANNULE';

function assignStatut(
  weekIndex: number,
  ofIndex: number,
  rand: () => number,
): StatutOf {
  // Week 0 (past): ~8 TERMINE
  if (weekIndex === 0) {
    return 'TERMINE';
  }
  // Week 1 (current): ~6 EN_COURS + a few EN_RETARD
  if (weekIndex === 1) {
    if (ofIndex < 6) return 'EN_COURS';
    if (ofIndex < 8) return 'EN_RETARD';
    return 'PLANIFIE';
  }
  // Week 2-5: mostly PLANIFIE, with 2 ANNULE sprinkled in
  if (weekIndex === 3 && ofIndex === 0) return 'ANNULE';
  if (weekIndex === 4 && ofIndex === 1) return 'ANNULE';

  return 'PLANIFIE';
}

// ─── Main export ────────────────────────────────────────────

export interface OfRecord {
  id: string;
  articleId: string;
  quantite: number;
  dateDebutPrevue: Date;
  dateFinPrevue: Date;
  statut: StatutOf;
  priorite: number;
  parentOfId: string | null;
  clientNom: string | null;
  clientRef: string | null;
  config: OfConfig | null;
  notes: string | null;
}

export async function seedOrdresFabrication(prisma: PrismaClient) {
  const rand = seededRandom(42);
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday

  const finalOfs: OfRecord[] = [];
  const subOfs: OfRecord[] = [];

  let finalOfNumber = 1001;
  let subOfNumber = 2001;

  // Distribute ~10 OFs per week across 6 weeks (weeks -1 to +4, centered so week 0 = current)
  // Week -1: past week (TERMINE)
  // Week 0: current week (EN_COURS / EN_RETARD)
  // Week 1-4: future (PLANIFIE, with some ANNULE)
  const ofsPerWeek = [8, 10, 10, 10, 12, 10]; // total = 60

  for (let week = 0; week < 6; week++) {
    const weekBase = addWeeks(weekStart, week - 1); // start from last week
    const count = ofsPerWeek[week];

    for (let i = 0; i < count; i++) {
      const ofId = `OF-${finalOfNumber++}`;
      const quantite = randInt(1, 5, rand);
      const dayOffset = randInt(0, 4, rand); // spread within the week
      const dateDebut = addDays(weekBase, dayOffset);
      const dateFin = addDays(dateDebut, 3); // 3 days assembly
      const statut = assignStatut(week, i, rand);
      const config = generateConfig(rand);

      const clientNom = pick(CLIENTS, rand);
      const clientRef = `CMD-${randInt(1000, 9999, rand)}`;

      const finalOf: OfRecord = {
        id: ofId,
        articleId: 'ART-PF-001',
        quantite,
        dateDebutPrevue: dateDebut,
        dateFinPrevue: dateFin,
        statut,
        priorite: randInt(1, 5, rand),
        parentOfId: null,
        clientNom,
        clientRef,
        config,
        notes: null,
      };

      finalOfs.push(finalOf);

      // ─── 3 Sub-OFs per final OF ──────────────────────
      // SF-001: Cadre + Plateau
      const sf001Start = addDays(dateDebut, -randInt(5, 7, rand));
      const sf001: OfRecord = {
        id: `OF-${subOfNumber++}`,
        articleId: 'ART-SF-001',
        quantite,
        dateDebutPrevue: sf001Start,
        dateFinPrevue: addDays(sf001Start, 2), // delai SF-001 = 2j
        statut: statut === 'ANNULE' ? 'ANNULE' : statut === 'TERMINE' ? 'TERMINE' : 'PLANIFIE',
        priorite: finalOf.priorite,
        parentOfId: ofId,
        clientNom: null,
        clientRef: null,
        config: null,
        notes: null,
      };

      // SF-002: Colonne + Guidon
      const sf002Start = addDays(dateDebut, -randInt(4, 6, rand));
      const sf002: OfRecord = {
        id: `OF-${subOfNumber++}`,
        articleId: 'ART-SF-002',
        quantite,
        dateDebutPrevue: sf002Start,
        dateFinPrevue: addDays(sf002Start, 1.5), // delai SF-002 = 1.5j
        statut: statut === 'ANNULE' ? 'ANNULE' : statut === 'TERMINE' ? 'TERMINE' : 'PLANIFIE',
        priorite: finalOf.priorite,
        parentOfId: ofId,
        clientNom: null,
        clientRef: null,
        config: null,
        notes: null,
      };

      // SF-003: Pack Batterie + Moteur
      const sf003Start = addDays(dateDebut, -randInt(6, 8, rand));
      const sf003: OfRecord = {
        id: `OF-${subOfNumber++}`,
        articleId: 'ART-SF-003',
        quantite,
        dateDebutPrevue: sf003Start,
        dateFinPrevue: addDays(sf003Start, 2.5), // delai SF-003 = 2.5j
        statut: statut === 'ANNULE' ? 'ANNULE' : statut === 'TERMINE' ? 'TERMINE' : 'PLANIFIE',
        priorite: finalOf.priorite,
        parentOfId: ofId,
        clientNom: null,
        clientRef: null,
        config: null,
        notes: null,
      };

      subOfs.push(sf001, sf002, sf003);
    }
  }

  // ─── Inject orphan sub-OFs (parentOfId -> non-existent) ───
  // Create 2 orphan sub-OFs pointing to ANNULE parent or null
  const annulledOf = finalOfs.find((of) => of.statut === 'ANNULE');
  if (annulledOf) {
    // Mark the sub-OFs of the annulled OF as orphans by leaving them as-is (parent is ANNULE)
    // Also add one pointing to a non-existent parent — but since we have FK constraints,
    // we'll mark one sub-OF's parent to an ANNULE OF (which is the realistic orphan case)
    const orphanSubOfs = subOfs.filter((s) => s.parentOfId === annulledOf.id);
    for (const orphan of orphanSubOfs) {
      orphan.notes = 'ORPHELIN: parent OF annulé';
    }
  }

  // ─── Bulk insert ──────────────────────────────────────────
  // Must insert finalOfs first (parents), then subOfs (children)
  for (const of_ of finalOfs) {
    await prisma.ordreFabrication.create({
      data: {
        id: of_.id,
        articleId: of_.articleId,
        quantite: of_.quantite,
        dateDebutPrevue: of_.dateDebutPrevue,
        dateFinPrevue: of_.dateFinPrevue,
        statut: of_.statut,
        priorite: of_.priorite,
        parentOfId: of_.parentOfId,
        clientNom: of_.clientNom,
        clientRef: of_.clientRef,
        config: of_.config ?? undefined,
        notes: of_.notes,
      },
    });
  }

  for (const of_ of subOfs) {
    await prisma.ordreFabrication.create({
      data: {
        id: of_.id,
        articleId: of_.articleId,
        quantite: of_.quantite,
        dateDebutPrevue: of_.dateDebutPrevue,
        dateFinPrevue: of_.dateFinPrevue,
        statut: of_.statut,
        priorite: of_.priorite,
        parentOfId: of_.parentOfId,
        clientNom: of_.clientNom,
        clientRef: of_.clientRef,
        config: of_.config ?? undefined,
        notes: of_.notes,
      },
    });
  }

  console.log(`  -> ${finalOfs.length} final OFs created`);
  console.log(`  -> ${subOfs.length} sub-OFs created`);

  return { ofs: finalOfs, subOfs };
}
