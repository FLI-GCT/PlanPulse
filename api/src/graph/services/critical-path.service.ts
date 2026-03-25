import { Injectable, Logger } from '@nestjs/common';
import { parseISO, addDays, differenceInCalendarDays, formatISO } from 'date-fns';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { CriticalPathResult, MarginResult } from 'src/graph/_entities';
import { GraphService } from './graph.service';

/**
 * Calcul du chemin critique (CPM - Critical Path Method).
 * Passe avant : Early Start / Early Finish
 * Passe arriere : Late Start / Late Finish
 * Marges totales et libres.
 */
@Injectable()
export class CriticalPathService {
  private readonly logger = new Logger(CriticalPathService.name);

  constructor(
    private readonly graph: GraphService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Recalcule complet du chemin critique.
   * Persiste les marges dans la table CacheMarge.
   */
  async recalculate(): Promise<CriticalPathResult> {
    const t0 = Date.now();
    const topoOrder = this.graph.topologicalSort();

    // Maps pour stocker les resultats des passes
    const earlyStart = new Map<string, Date>();
    const earlyFinish = new Map<string, Date>();
    const lateStart = new Map<string, Date>();
    const lateFinish = new Map<string, Date>();

    // ─── Passe avant (Early Start / Early Finish) ────────────

    for (const nodeId of topoOrder) {
      const node = this.graph.getNode(nodeId);
      if (!node) continue;

      const duration = differenceInCalendarDays(
        parseISO(node.dateFin),
        parseISO(node.dateDebut),
      );

      const predecessorEdges = this.graph.getPredecessors(nodeId);

      let es: Date;
      if (predecessorEdges.length === 0) {
        // Noeud racine : early start = date debut du noeud
        es = parseISO(node.dateDebut);
      } else {
        // Max de (predecesseur.earlyFinish + delaiMinimum)
        es = parseISO(node.dateDebut); // valeur par defaut
        for (const edge of predecessorEdges) {
          const predEf = earlyFinish.get(edge.sourceId);
          if (predEf) {
            const possibleStart = addDays(predEf, edge.delaiMinimum);
            if (possibleStart > es) {
              es = possibleStart;
            }
          }
        }
      }

      earlyStart.set(nodeId, es);
      earlyFinish.set(nodeId, addDays(es, duration));
    }

    // ─── Passe arriere (Late Start / Late Finish) ────────────

    // Trouver la date de fin maximale du projet
    let projectEnd: Date | null = null;
    for (const ef of earlyFinish.values()) {
      if (!projectEnd || ef > projectEnd) {
        projectEnd = ef;
      }
    }

    if (!projectEnd) {
      return { criticalNodes: [], margins: [] };
    }

    // Parcours en ordre inverse
    const reverseOrder = [...topoOrder].reverse();

    for (const nodeId of reverseOrder) {
      const node = this.graph.getNode(nodeId);
      if (!node) continue;

      const duration = differenceInCalendarDays(
        parseISO(node.dateFin),
        parseISO(node.dateDebut),
      );

      const successorEdges = this.graph.getSuccessors(nodeId);

      let lf: Date;
      if (successorEdges.length === 0) {
        // Noeud terminal : late finish = fin du projet
        lf = projectEnd;
      } else {
        // Min de (successeur.lateStart - delaiMinimum)
        lf = projectEnd; // valeur par defaut
        for (const edge of successorEdges) {
          const succLs = lateStart.get(edge.targetId);
          if (succLs) {
            const possibleFinish = addDays(succLs, -edge.delaiMinimum);
            if (possibleFinish < lf) {
              lf = possibleFinish;
            }
          }
        }
      }

      lateFinish.set(nodeId, lf);
      lateStart.set(nodeId, addDays(lf, -duration));
    }

    // ─── Calcul des marges ──────────────────────────────────

    const margins: MarginResult[] = [];
    const criticalNodes: string[] = [];

    for (const nodeId of topoOrder) {
      const es = earlyStart.get(nodeId);
      const ef = earlyFinish.get(nodeId);
      const ls = lateStart.get(nodeId);
      const lf = lateFinish.get(nodeId);

      if (!es || !ef || !ls || !lf) continue;

      const floatTotal = differenceInCalendarDays(ls, es);

      // Marge libre = min(successeurs.earlyStart - delaiMinimum) - earlyFinish
      let floatLibre = 0;
      const successorEdges = this.graph.getSuccessors(nodeId);
      if (successorEdges.length > 0) {
        let minSuccStart = Infinity;
        for (const edge of successorEdges) {
          const succEs = earlyStart.get(edge.targetId);
          if (succEs) {
            const available = differenceInCalendarDays(
              addDays(succEs, -edge.delaiMinimum),
              ef,
            );
            if (available < minSuccStart) {
              minSuccStart = available;
            }
          }
        }
        floatLibre = minSuccStart === Infinity ? 0 : Math.max(0, minSuccStart);
      }

      const estCritique = floatTotal === 0;
      if (estCritique) {
        criticalNodes.push(nodeId);
      }

      margins.push({
        nodeId,
        earlyStart: formatISO(es, { representation: 'date' }),
        earlyFinish: formatISO(ef, { representation: 'date' }),
        lateStart: formatISO(ls, { representation: 'date' }),
        lateFinish: formatISO(lf, { representation: 'date' }),
        floatTotal,
        floatLibre,
        estCritique,
      });
    }

    // ─── Persister dans CacheMarge ──────────────────────────

    await this.persistMargins(margins);

    const elapsed = Date.now() - t0;
    this.logger.log(
      `Chemin critique recalcule : ${criticalNodes.length} noeuds critiques sur ${margins.length} en ${elapsed}ms`,
    );

    return { criticalNodes, margins };
  }

  private async persistMargins(margins: MarginResult[]): Promise<void> {
    // Filtrer uniquement les noeuds de type OF (CacheMarge est lie a OrdreFabrication)
    const ofMargins = margins.filter((m) => {
      const node = this.graph.getNode(m.nodeId);
      return node?.type === 'of';
    });

    // Upsert par batch
    const upserts = ofMargins.map((m) =>
      this.prisma.cacheMarge.upsert({
        where: { ofId: m.nodeId },
        create: {
          ofId: m.nodeId,
          earlyStart: new Date(m.earlyStart),
          earlyFinish: new Date(m.earlyFinish),
          lateStart: new Date(m.lateStart),
          lateFinish: new Date(m.lateFinish),
          floatTotal: m.floatTotal,
          floatLibre: m.floatLibre,
          estCritique: m.estCritique,
          updatedAt: new Date(),
        },
        update: {
          earlyStart: new Date(m.earlyStart),
          earlyFinish: new Date(m.earlyFinish),
          lateStart: new Date(m.lateStart),
          lateFinish: new Date(m.lateFinish),
          floatTotal: m.floatTotal,
          floatLibre: m.floatLibre,
          estCritique: m.estCritique,
          updatedAt: new Date(),
        },
      }),
    );

    await Promise.all(upserts);
  }
}
