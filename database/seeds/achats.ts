import { addDays, subDays } from 'date-fns';
import type { PrismaClient } from '../generated/prisma';
import type { OfRecord } from './ordres-fabrication';

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

const FOURNISSEURS = [
  'AlluParts SA',
  'WheelTech',
  'BrakeMax',
  'LightPro',
  'ElectroDrive',
  'BatteryWorld',
  'FixturePlus',
  'MetalCraft',
];

// Map articles to preferred fournisseurs for realism
const ARTICLE_FOURNISSEUR: Record<string, string[]> = {
  'ART-AC-001': ['AlluParts SA', 'MetalCraft'],
  'ART-AC-002': ['WheelTech'],
  'ART-AC-003': ['WheelTech'],
  'ART-AC-004': ['BrakeMax'],
  'ART-AC-005': ['LightPro'],
  'ART-AC-006': ['ElectroDrive'],
  'ART-AC-007': ['ElectroDrive', 'FixturePlus'],
  'ART-AC-008': ['FixturePlus', 'MetalCraft'],
  'ART-AC-009': ['FixturePlus'],
  'ART-AC-010': ['MetalCraft', 'FixturePlus'],
  'ART-AC-011': ['MetalCraft'],
  'ART-AC-012': ['AlluParts SA', 'MetalCraft'],
  'ART-AC-013': ['LightPro', 'FixturePlus'],
  'ART-AS-001': ['AlluParts SA'],
  'ART-AS-002': ['AlluParts SA'],
  'ART-AS-003': ['AlluParts SA'],
  'ART-AS-004': ['MetalCraft'],
  'ART-AS-005': ['MetalCraft'],
  'ART-AS-006': ['BatteryWorld'],
  'ART-AS-007': ['BatteryWorld'],
  'ART-AS-008': ['ElectroDrive'],
  'ART-AS-009': ['ElectroDrive'],
  'ART-AS-010': ['WheelTech'],
  'ART-AS-011': ['MetalCraft'],
  'ART-AS-012': ['LightPro'],
};

// Delais for articles (mirrors articles.ts)
const ARTICLE_DELAI: Record<string, number> = {
  'ART-AC-001': 15,
  'ART-AC-002': 10,
  'ART-AC-003': 10,
  'ART-AC-004': 12,
  'ART-AC-005': 8,
  'ART-AC-006': 20,
  'ART-AC-007': 10,
  'ART-AC-008': 5,
  'ART-AC-009': 5,
  'ART-AC-010': 7,
  'ART-AC-011': 8,
  'ART-AC-012': 10,
  'ART-AC-013': 5,
  'ART-AS-001': 12,
  'ART-AS-002': 12,
  'ART-AS-003': 14,
  'ART-AS-004': 12,
  'ART-AS-005': 12,
  'ART-AS-006': 25,
  'ART-AS-007': 18,
  'ART-AS-008': 20,
  'ART-AS-009': 15,
  'ART-AS-010': 10,
  'ART-AS-011': 8,
  'ART-AS-012': 10,
};

// Prix unitaire for achats (slightly above article cost to reflect purchase price)
const ARTICLE_PRIX: Record<string, number> = {
  'ART-AC-001': 68.0,
  'ART-AC-002': 24.0,
  'ART-AC-003': 24.0,
  'ART-AC-004': 37.0,
  'ART-AC-005': 19.5,
  'ART-AC-006': 58.0,
  'ART-AC-007': 13.0,
  'ART-AC-008': 8.5,
  'ART-AC-009': 5.0,
  'ART-AC-010': 6.5,
  'ART-AC-011': 9.5,
  'ART-AC-012': 15.0,
  'ART-AC-013': 5.5,
  'ART-AS-001': 30.0,
  'ART-AS-002': 30.0,
  'ART-AS-003': 44.0,
  'ART-AS-004': 40.0,
  'ART-AS-005': 44.0,
  'ART-AS-006': 200.0,
  'ART-AS-007': 125.0,
  'ART-AS-008': 150.0,
  'ART-AS-009': 110.0,
  'ART-AS-010': 34.0,
  'ART-AS-011': 26.0,
  'ART-AS-012': 37.0,
};

// Common article IDs
const COMMON_ARTICLES = [
  'ART-AC-001',
  'ART-AC-002',
  'ART-AC-003',
  'ART-AC-004',
  'ART-AC-005',
  'ART-AC-006',
  'ART-AC-007',
  'ART-AC-008',
  'ART-AC-009',
  'ART-AC-010',
  'ART-AC-011',
  'ART-AC-012',
  'ART-AC-013',
];

type StatutAchat = 'COMMANDE' | 'EN_TRANSIT' | 'RECEPTIONNE' | 'EN_RETARD' | 'ANNULE';

export interface AchatRecord {
  id: string;
  articleId: string;
  quantite: number;
  quantiteRecue: number;
  dateCommande: Date;
  dateLivraisonPrevue: Date;
  dateLivraisonReelle: Date | null;
  fournisseur: string;
  statut: StatutAchat;
  typeLien: string;
  ofSpecifiqueId: string | null;
  prixUnitaire: number | null;
  notes: string | null;
}

// ─── Main export ────────────────────────────────────────────

export async function seedAchats(prisma: PrismaClient, finalOfs: OfRecord[]) {
  const rand = seededRandom(777);
  const today = new Date();
  const achats: AchatRecord[] = [];

  let globalCounter = 1;
  let specificCounter = 1;

  // ─── Global purchases (ACHETE_COMMUN) ─────────────────
  for (const articleId of COMMON_ARTICLES) {
    const numOrders = randInt(2, 4, rand);
    const delai = ARTICLE_DELAI[articleId];
    const fournisseurs = ARTICLE_FOURNISSEUR[articleId];

    for (let i = 0; i < numOrders; i++) {
      const quantite = randInt(25, 80, rand);
      // Spread order dates: some in the past, some recent
      const orderDaysAgo = randInt(5, 40, rand);
      const dateCommande = subDays(today, orderDaysAgo);
      const dateLivraisonPrevue = addDays(dateCommande, delai + randInt(-2, 5, rand));
      const fournisseur = pick(fournisseurs, rand);

      // Determine statut based on delivery date
      let statut: StatutAchat;
      let dateLivraisonReelle: Date | null = null;
      let quantiteRecue = 0;

      if (dateLivraisonPrevue < today) {
        // Past delivery date
        if (rand() < 0.6) {
          statut = 'RECEPTIONNE';
          dateLivraisonReelle = addDays(dateLivraisonPrevue, randInt(-1, 2, rand));
          quantiteRecue = quantite;
        } else {
          statut = 'EN_RETARD';
          quantiteRecue = 0;
        }
      } else {
        // Future delivery date
        if (rand() < 0.3) {
          statut = 'EN_TRANSIT';
        } else {
          statut = 'COMMANDE';
        }
      }

      const achatId = `ACH-G-${String(globalCounter++).padStart(3, '0')}`;

      achats.push({
        id: achatId,
        articleId,
        quantite,
        quantiteRecue,
        dateCommande,
        dateLivraisonPrevue,
        dateLivraisonReelle,
        fournisseur,
        statut,
        typeLien: 'partage',
        ofSpecifiqueId: null,
        prixUnitaire: ARTICLE_PRIX[articleId],
        notes: null,
      });
    }
  }

  // ─── Inject problem 1: Force 3-5 achats EN_RETARD with past dates ─
  const retardCandidates = achats.filter(
    (a) => a.statut !== 'RECEPTIONNE' && a.statut !== 'EN_RETARD',
  );
  const retardCount = Math.min(5, retardCandidates.length);
  for (let i = 0; i < retardCount; i++) {
    const target = retardCandidates[i];
    target.statut = 'EN_RETARD';
    target.dateLivraisonPrevue = subDays(today, randInt(3, 10, rand));
    target.quantiteRecue = 0;
    target.notes = 'Retard fournisseur';
  }

  // ─── Inject problem 2: Insufficient quantity on roues & controleurs ─
  // Find global achats for roue avant (AC-002) and controleur (AC-006)
  const roueAchats = achats.filter((a) => a.articleId === 'ART-AC-002');
  const controleurAchats = achats.filter((a) => a.articleId === 'ART-AC-006');

  // Reduce quantities to create shortage
  for (const a of roueAchats) {
    a.quantite = Math.max(5, Math.floor(a.quantite * 0.3));
    if (a.statut === 'RECEPTIONNE') {
      a.quantiteRecue = a.quantite;
    }
  }
  for (const a of controleurAchats) {
    a.quantite = Math.max(5, Math.floor(a.quantite * 0.3));
    if (a.statut === 'RECEPTIONNE') {
      a.quantiteRecue = a.quantite;
    }
  }

  // ─── Specific purchases (ACHETE_SPECIFIQUE) ───────────
  // For each final OF that has specific options, create linked purchases
  for (const of_ of finalOfs) {
    if (!of_.config) continue;
    const config = of_.config;

    const specificArticles: string[] = [];

    if (config.plateau) specificArticles.push(config.plateau);
    if (config.guidon) specificArticles.push(config.guidon);
    if (config.batterie) specificArticles.push(config.batterie);
    if (config.moteur) specificArticles.push(config.moteur);
    if (config.pneu) specificArticles.push(config.pneu);
    if (config.accessoire) specificArticles.push(config.accessoire);
    if (config.eclairage) specificArticles.push(config.eclairage);

    for (const articleId of specificArticles) {
      const delai = ARTICLE_DELAI[articleId] ?? 10;
      const fournisseurs = ARTICLE_FOURNISSEUR[articleId] ?? FOURNISSEURS;
      const fournisseur = pick(fournisseurs, rand);

      const dateCommande = subDays(of_.dateDebutPrevue, delai + randInt(2, 5, rand));
      const dateLivraisonPrevue = addDays(dateCommande, delai + randInt(-1, 3, rand));

      let statut: StatutAchat;
      let dateLivraisonReelle: Date | null = null;
      let quantiteRecue = 0;

      if (of_.statut === 'TERMINE') {
        statut = 'RECEPTIONNE';
        dateLivraisonReelle = addDays(dateLivraisonPrevue, randInt(-2, 1, rand));
        quantiteRecue = of_.quantite;
      } else if (of_.statut === 'ANNULE') {
        statut = 'ANNULE';
      } else if (dateLivraisonPrevue < today) {
        if (rand() < 0.5) {
          statut = 'RECEPTIONNE';
          dateLivraisonReelle = addDays(dateLivraisonPrevue, randInt(0, 2, rand));
          quantiteRecue = of_.quantite;
        } else {
          statut = 'EN_RETARD';
        }
      } else {
        statut = rand() < 0.4 ? 'EN_TRANSIT' : 'COMMANDE';
      }

      // Inject problem 3: BatteryWorld has 80% EN_RETARD
      if (fournisseur === 'BatteryWorld' && statut !== 'RECEPTIONNE' && statut !== 'ANNULE') {
        if (rand() < 0.8) {
          statut = 'EN_RETARD';
          // Push delivery to past to make it a real late delivery
          if (dateLivraisonPrevue >= today) {
            achats.push({
              id: `ACH-S-${String(specificCounter++).padStart(3, '0')}`,
              articleId,
              quantite: of_.quantite,
              quantiteRecue: 0,
              dateCommande,
              dateLivraisonPrevue: subDays(today, randInt(1, 7, rand)),
              dateLivraisonReelle: null,
              fournisseur,
              statut: 'EN_RETARD',
              typeLien: 'specifique',
              ofSpecifiqueId: of_.id,
              prixUnitaire: ARTICLE_PRIX[articleId] ?? null,
              notes: 'BatteryWorld - retard chronique',
            });
            continue; // skip normal push
          }
        }
      }

      achats.push({
        id: `ACH-S-${String(specificCounter++).padStart(3, '0')}`,
        articleId,
        quantite: of_.quantite,
        quantiteRecue,
        dateCommande,
        dateLivraisonPrevue,
        dateLivraisonReelle,
        fournisseur,
        statut,
        typeLien: 'specifique',
        ofSpecifiqueId: of_.id,
        prixUnitaire: ARTICLE_PRIX[articleId] ?? null,
        notes: null,
      });
    }
  }

  // ─── Inject problem 4: 1 achat obsolete (ofSpecifique -> ANNULE OF) ─
  const annulledOf = finalOfs.find((of_) => of_.statut === 'ANNULE');
  if (annulledOf) {
    const obsoleteAchat = achats.find(
      (a) => a.ofSpecifiqueId === annulledOf.id && a.statut !== 'ANNULE',
    );
    if (obsoleteAchat) {
      obsoleteAchat.notes = 'OBSOLETE: OF parent annulé, achat non annulé';
      // Keep statut as COMMANDE to make it a real problem
      obsoleteAchat.statut = 'COMMANDE';
    }
  }

  // ─── Bulk insert ──────────────────────────────────────────
  for (const achat of achats) {
    await prisma.achat.create({
      data: {
        id: achat.id,
        articleId: achat.articleId,
        quantite: achat.quantite,
        quantiteRecue: achat.quantiteRecue,
        dateCommande: achat.dateCommande,
        dateLivraisonPrevue: achat.dateLivraisonPrevue,
        dateLivraisonReelle: achat.dateLivraisonReelle,
        fournisseur: achat.fournisseur,
        statut: achat.statut,
        typeLien: achat.typeLien,
        ofSpecifiqueId: achat.ofSpecifiqueId,
        prixUnitaire: achat.prixUnitaire,
        notes: achat.notes,
      },
    });
  }

  const globalCount = achats.filter((a) => a.typeLien === 'partage').length;
  const specificCount = achats.filter((a) => a.typeLien === 'specifique').length;
  console.log(`  -> ${globalCount} global achats created`);
  console.log(`  -> ${specificCount} specific achats created`);
  console.log(`  -> ${achats.length} total achats created`);

  return achats;
}
