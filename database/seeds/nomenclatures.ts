import type { PrismaClient } from '../generated/prisma';

export async function seedNomenclatures(prisma: PrismaClient) {
  const nomenclatures = [
    // ─── Trottinette (PF-001) -> sous-ensembles ─────────
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-SF-001', quantite: 1, optionnel: false, groupeOption: null },
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-SF-002', quantite: 1, optionnel: false, groupeOption: null },
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-SF-003', quantite: 1, optionnel: false, groupeOption: null },

    // ─── Trottinette (PF-001) -> composants directs ─────
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-002', quantite: 1, optionnel: false, groupeOption: null },  // Roue avant
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-003', quantite: 1, optionnel: false, groupeOption: null },  // Roue arriere
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-004', quantite: 1, optionnel: false, groupeOption: null },  // Kit freinage
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-005', quantite: 1, optionnel: false, groupeOption: null },  // Kit eclairage
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-008', quantite: 1, optionnel: false, groupeOption: null },  // Visserie
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-011', quantite: 1, optionnel: false, groupeOption: null },  // Bequille
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-012', quantite: 1, optionnel: false, groupeOption: null },  // Garde-boue
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AC-013', quantite: 1, optionnel: false, groupeOption: null },  // Sonnette + reflecteurs

    // ─── Trottinette (PF-001) -> options spécifiques directes ─
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AS-010', quantite: 1, optionnel: true, groupeOption: 'pneu' },        // Pneu tout-terrain
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AS-011', quantite: 1, optionnel: true, groupeOption: 'accessoire' },   // Porte-bagages
    { parentArticleId: 'ART-PF-001', composantArticleId: 'ART-AS-012', quantite: 1, optionnel: true, groupeOption: 'eclairage' },    // Eclairage premium

    // ─── SF-001 (Cadre + Plateau) -> composants ─────────
    { parentArticleId: 'ART-SF-001', composantArticleId: 'ART-AC-001', quantite: 1, optionnel: false, groupeOption: null },  // Cadre alu
    { parentArticleId: 'ART-SF-001', composantArticleId: 'ART-AC-010', quantite: 1, optionnel: false, groupeOption: null },  // Grip poignee
    { parentArticleId: 'ART-SF-001', composantArticleId: 'ART-AC-009', quantite: 1, optionnel: false, groupeOption: null },  // Joint etancheite

    // ─── SF-001 -> options plateau ──────────────────────
    { parentArticleId: 'ART-SF-001', composantArticleId: 'ART-AS-001', quantite: 1, optionnel: true, groupeOption: 'plateau' }, // Plateau rouge
    { parentArticleId: 'ART-SF-001', composantArticleId: 'ART-AS-002', quantite: 1, optionnel: true, groupeOption: 'plateau' }, // Plateau bleu
    { parentArticleId: 'ART-SF-001', composantArticleId: 'ART-AS-003', quantite: 1, optionnel: true, groupeOption: 'plateau' }, // Plateau XL

    // ─── SF-002 (Colonne + Guidon) -> composants ────────
    { parentArticleId: 'ART-SF-002', composantArticleId: 'ART-AC-007', quantite: 1, optionnel: false, groupeOption: null },  // Faisceau electrique

    // ─── SF-002 -> options guidon ───────────────────────
    { parentArticleId: 'ART-SF-002', composantArticleId: 'ART-AS-004', quantite: 1, optionnel: true, groupeOption: 'guidon' }, // Guidon sport
    { parentArticleId: 'ART-SF-002', composantArticleId: 'ART-AS-005', quantite: 1, optionnel: true, groupeOption: 'guidon' }, // Guidon confort

    // ─── SF-003 (Pack Batterie + Moteur) -> composants ──
    { parentArticleId: 'ART-SF-003', composantArticleId: 'ART-AC-006', quantite: 1, optionnel: false, groupeOption: null },  // Controleur electronique

    // ─── SF-003 -> options batterie ─────────────────────
    { parentArticleId: 'ART-SF-003', composantArticleId: 'ART-AS-006', quantite: 1, optionnel: true, groupeOption: 'batterie' }, // Batterie 48V LR
    { parentArticleId: 'ART-SF-003', composantArticleId: 'ART-AS-007', quantite: 1, optionnel: true, groupeOption: 'batterie' }, // Batterie 36V std

    // ─── SF-003 -> options moteur ───────────────────────
    { parentArticleId: 'ART-SF-003', composantArticleId: 'ART-AS-008', quantite: 1, optionnel: true, groupeOption: 'moteur' }, // Moteur 500W
    { parentArticleId: 'ART-SF-003', composantArticleId: 'ART-AS-009', quantite: 1, optionnel: true, groupeOption: 'moteur' }, // Moteur 350W
  ];

  // Use individual creates since createMany doesn't support autoincrement id well on all DBs
  // and we want to let the DB auto-increment
  for (const nom of nomenclatures) {
    await prisma.nomenclature.create({
      data: {
        parentArticleId: nom.parentArticleId,
        composantArticleId: nom.composantArticleId,
        quantite: nom.quantite,
        optionnel: nom.optionnel,
        groupeOption: nom.groupeOption,
      },
    });
  }

  console.log(`  -> ${nomenclatures.length} nomenclatures created`);

  return nomenclatures;
}
