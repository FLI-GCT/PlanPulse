import { Injectable, Logger } from '@nestjs/common';
import { parseISO } from 'date-fns';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { GraphService } from './graph.service';

interface AllocationEntry {
  achatId: string;
  ofId: string;
  quantiteAllouee: number;
  rangPriorite: number;
  couvert: boolean;
}

/**
 * Service d'allocation des achats partages aux OFs.
 * Pour chaque achat de type PARTAGE, repartit les quantites
 * entre les OFs demandeurs par ordre de priorite puis date de debut.
 */
@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);

  constructor(
    private readonly graph: GraphService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Recalcule toutes les allocations pour tous les achats partages.
   */
  async allocateAll(): Promise<AllocationEntry[]> {
    const t0 = Date.now();
    const allAllocations: AllocationEntry[] = [];

    // Supprimer les allocations existantes
    await this.prisma.cacheAllocation.deleteMany();

    // Trouver tous les achats partages
    const achatsPartages = this.graph.getAllEdges().filter(
      (e) => e.sourceType === 'achat' && e.typeLien === 'PARTAGE',
    );

    // Regrouper par achatId
    const achatEdgeMap = new Map<string, typeof achatsPartages>();
    for (const edge of achatsPartages) {
      const existing = achatEdgeMap.get(edge.sourceId);
      if (existing) {
        existing.push(edge);
      } else {
        achatEdgeMap.set(edge.sourceId, [edge]);
      }
    }

    for (const [achatId, edges] of achatEdgeMap) {
      const allocations = this.allocateForAchat(achatId, edges);
      allAllocations.push(...allocations);
    }

    // Persister en base
    if (allAllocations.length > 0) {
      await this.prisma.cacheAllocation.createMany({
        data: allAllocations.map((a) => ({
          achatId: a.achatId,
          ofId: a.ofId,
          quantiteAllouee: a.quantiteAllouee,
          rangPriorite: a.rangPriorite,
          couvert: a.couvert,
          updatedAt: new Date(),
        })),
      });
    }

    const elapsed = Date.now() - t0;
    this.logger.log(
      `Allocations recalculees : ${allAllocations.length} lignes en ${elapsed}ms`,
    );

    return allAllocations;
  }

  /**
   * Recalcule les allocations pour un seul achat.
   */
  async reallocate(achatId: string): Promise<AllocationEntry[]> {
    // Supprimer les allocations existantes pour cet achat
    await this.prisma.cacheAllocation.deleteMany({
      where: { achatId },
    });

    const edges = this.graph
      .getAllEdges()
      .filter((e) => e.sourceId === achatId && e.typeLien === 'PARTAGE');

    const allocations = this.allocateForAchat(achatId, edges);

    // Persister
    if (allocations.length > 0) {
      await this.prisma.cacheAllocation.createMany({
        data: allocations.map((a) => ({
          achatId: a.achatId,
          ofId: a.ofId,
          quantiteAllouee: a.quantiteAllouee,
          rangPriorite: a.rangPriorite,
          couvert: a.couvert,
          updatedAt: new Date(),
        })),
      });
    }

    return allocations;
  }

  /**
   * Algorithme d'allocation pour un achat donne.
   * Tri des OFs par priorite ASC puis dateDebutPrevue ASC.
   * Allocation first-fit : le premier OF recoit min(besoin, restant).
   */
  private allocateForAchat(
    achatId: string,
    edges: { targetId: string; quantite: number | null }[],
  ): AllocationEntry[] {
    const achatNode = this.graph.getNode(achatId);
    if (!achatNode) return [];

    let remaining = achatNode.quantite;

    // Collecter les OFs demandeurs avec leurs besoins
    const demandeurs: Array<{
      ofId: string;
      besoin: number;
      priorite: number;
      dateDebut: Date;
    }> = [];

    for (const edge of edges) {
      const ofNode = this.graph.getNode(edge.targetId);
      if (!ofNode || ofNode.type !== 'of') continue;

      demandeurs.push({
        ofId: edge.targetId,
        besoin: edge.quantite ?? ofNode.quantite,
        priorite: ofNode.priorite ?? 999,
        dateDebut: parseISO(ofNode.dateDebut),
      });
    }

    // Trier : priorite ASC, puis dateDebut ASC
    demandeurs.sort((a, b) => {
      if (a.priorite !== b.priorite) return a.priorite - b.priorite;
      return a.dateDebut.getTime() - b.dateDebut.getTime();
    });

    const allocations: AllocationEntry[] = [];

    for (let i = 0; i < demandeurs.length; i++) {
      const d = demandeurs[i];
      const allocated = Math.min(d.besoin, Math.max(0, remaining));
      remaining -= allocated;

      allocations.push({
        achatId,
        ofId: d.ofId,
        quantiteAllouee: allocated,
        rangPriorite: i + 1,
        couvert: allocated >= d.besoin,
      });
    }

    return allocations;
  }
}
