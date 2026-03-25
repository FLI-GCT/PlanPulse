import { Injectable, Logger } from '@nestjs/common';
import { parseISO, addDays, formatISO } from 'date-fns';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { GraphService } from './graph.service';

interface ComposantManquant {
  articleId: string;
  label: string;
  quantiteRequise: number;
  quantiteDisponible: number;
  deficit: number;
}

interface FeasibilityResult {
  feasible: boolean;
  dateAuPlusTot: string;
  composantsManquants: ComposantManquant[];
  ofImpactes: string[];
}

interface BomComponent {
  composantArticleId: string;
  quantiteCumulee: number;
}

/**
 * Service d'analyse de faisabilite.
 * Verifie si un article peut etre fabrique en quantite souhaitee
 * en fonction des achats alloues et des nomenclatures.
 */
@Injectable()
export class FeasibilityService {
  private readonly logger = new Logger(FeasibilityService.name);

  constructor(
    private readonly graph: GraphService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verifie la faisabilite de fabrication d'un article.
   * 1. Eclate la nomenclature recursivement
   * 2. Verifie les allocations d'achats pour chaque composant
   * 3. Calcule la date au plus tot basee sur la disponibilite des composants
   */
  async check(
    articleId: string,
    quantite: number,
    dateSouhaitee: string,
  ): Promise<FeasibilityResult> {
    // 1. Eclater la nomenclature
    const bom = await this.explodeBom(articleId, quantite);

    const composantsManquants: ComposantManquant[] = [];
    const ofImpactes = new Set<string>();
    let latestAvailability = parseISO(dateSouhaitee);

    // 2. Pour chaque composant, verifier les achats disponibles
    for (const comp of bom) {
      // Trouver les achats pour cet article
      const achatsForArticle = this.graph.getAllNodes().filter(
        (n) => n.type === 'achat' && n.articleId === comp.composantArticleId,
      );

      // Calculer la quantite totale disponible
      let totalDisponible = 0;
      let latestDate = parseISO(dateSouhaitee);

      for (const achat of achatsForArticle) {
        if (achat.statut === 'ANNULE') continue;

        // Verifier les allocations existantes
        const allocations = await this.prisma.cacheAllocation.findMany({
          where: { achatId: achat.id },
        });

        const totalAlloue = allocations.reduce((sum, a) => sum + a.quantiteAllouee, 0);
        const restant = achat.quantite - totalAlloue;

        if (restant > 0) {
          totalDisponible += restant;
          const achatFin = parseISO(achat.dateFin);
          if (achatFin > latestDate) {
            latestDate = achatFin;
          }
        }

        // Collecter les OFs impactes
        for (const alloc of allocations) {
          ofImpactes.add(alloc.ofId);
        }
      }

      if (totalDisponible < comp.quantiteCumulee) {
        const article = await this.prisma.article.findUnique({
          where: { id: comp.composantArticleId },
        });

        composantsManquants.push({
          articleId: comp.composantArticleId,
          label: article?.label ?? comp.composantArticleId,
          quantiteRequise: comp.quantiteCumulee,
          quantiteDisponible: totalDisponible,
          deficit: comp.quantiteCumulee - totalDisponible,
        });
      }

      if (latestDate > latestAvailability) {
        latestAvailability = latestDate;
      }
    }

    // Ajouter le delai de fabrication de l'article principal
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    const delaiFabrication = article?.delaiJours ?? 1;
    const dateAuPlusTot = addDays(latestAvailability, delaiFabrication);

    return {
      feasible: composantsManquants.length === 0,
      dateAuPlusTot: formatISO(dateAuPlusTot, { representation: 'date' }),
      composantsManquants,
      ofImpactes: Array.from(ofImpactes),
    };
  }

  /**
   * Eclate la nomenclature recursivement pour un article.
   * Retourne la liste a plat des composants avec quantites cumulees.
   */
  private async explodeBom(
    articleId: string,
    quantiteParent: number,
  ): Promise<BomComponent[]> {
    const result: BomComponent[] = [];
    await this.explodeRecursive(articleId, quantiteParent, result, new Set());
    return result;
  }

  private async explodeRecursive(
    parentArticleId: string,
    parentQuantite: number,
    result: BomComponent[],
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(parentArticleId)) return;
    visited.add(parentArticleId);

    const children = await this.prisma.nomenclature.findMany({
      where: { parentArticleId },
    });

    for (const child of children) {
      const quantiteCumulee = parentQuantite * child.quantite;

      result.push({
        composantArticleId: child.composantArticleId,
        quantiteCumulee,
      });

      // Continuer l'eclatement pour les sous-composants
      await this.explodeRecursive(
        child.composantArticleId,
        quantiteCumulee,
        result,
        new Set(visited),
      );
    }
  }
}
