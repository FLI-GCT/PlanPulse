import { Injectable, Logger } from '@nestjs/common';
import { parseISO, addDays, differenceInCalendarDays, formatISO } from 'date-fns';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { PropagationResult } from 'src/graph/_entities';
import { GraphService } from './graph.service';

/**
 * Propagation des dates dans le DAG.
 * Quand un noeud est deplace, tous ses successeurs sont recalcules
 * en respectant les delais minimum des aretes.
 */
@Injectable()
export class PropagationService {
  private readonly logger = new Logger(PropagationService.name);

  constructor(
    private readonly graph: GraphService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Preview (lecture seule) ──────────────────────────────

  /**
   * Calcule l'impact du deplacement d'un noeud sans modifier le graphe.
   * Retourne la liste des noeuds impactes avec leurs nouvelles dates.
   */
  propagatePreview(nodeId: string, newDateDebut: string): PropagationResult[] {
    const node = this.graph.getNode(nodeId);
    if (!node) return [];

    const results: PropagationResult[] = [];

    // Copie de travail des dates (pour ne pas muter le graphe)
    const workingDates = new Map<string, { dateDebut: string; dateFin: string }>();

    // Calculer la nouvelle dateFin du noeud deplace
    const currentDebut = parseISO(node.dateDebut);
    const currentFin = parseISO(node.dateFin);
    const duration = differenceInCalendarDays(currentFin, currentDebut);

    const newDebut = parseISO(newDateDebut);
    const newFin = addDays(newDebut, duration);
    const newDateFin = formatISO(newFin, { representation: 'date' });

    workingDates.set(nodeId, { dateDebut: newDateDebut, dateFin: newDateFin });

    results.push({
      nodeId,
      oldDateDebut: node.dateDebut,
      newDateDebut,
      oldDateFin: node.dateFin,
      newDateFin,
      deltaJours: differenceInCalendarDays(newDebut, currentDebut),
    });

    // Obtenir l'ordre topologique filtre aux descendants
    const reachable = new Set(this.graph.getSubgraph(nodeId));
    const topoOrder = this.graph.topologicalSort().filter((id) => reachable.has(id));

    // Parcourir en ordre topologique (apres le noeud deplace)
    for (const currentId of topoOrder) {
      if (currentId === nodeId) continue;

      const currentNode = this.graph.getNode(currentId);
      if (!currentNode) continue;

      // Calculer le plus tot debut possible base sur tous les predecesseurs
      let earliestStart: Date | null = null;
      const predecessorEdges = this.graph.getPredecessors(currentId);

      for (const edge of predecessorEdges) {
        // Utiliser la date de travail si le predecesseur a ete impacte, sinon la date courante
        const predDates = workingDates.get(edge.sourceId);
        const predFin = predDates
          ? parseISO(predDates.dateFin)
          : parseISO(this.graph.getNode(edge.sourceId)?.dateFin ?? currentNode.dateDebut);

        const possibleStart = addDays(predFin, edge.delaiMinimum);

        if (!earliestStart || possibleStart > earliestStart) {
          earliestStart = possibleStart;
        }
      }

      if (!earliestStart) continue;

      const nodeDateDebut = parseISO(currentNode.dateDebut);
      const nodeDateFin = parseISO(currentNode.dateFin);

      // Decaler seulement si la nouvelle date est plus tardive
      if (earliestStart > nodeDateDebut) {
        const nodeDuration = differenceInCalendarDays(nodeDateFin, nodeDateDebut);
        const newNodeFin = addDays(earliestStart, nodeDuration);

        const newNodeDateDebut = formatISO(earliestStart, { representation: 'date' });
        const newNodeDateFin = formatISO(newNodeFin, { representation: 'date' });

        workingDates.set(currentId, {
          dateDebut: newNodeDateDebut,
          dateFin: newNodeDateFin,
        });

        results.push({
          nodeId: currentId,
          oldDateDebut: currentNode.dateDebut,
          newDateDebut: newNodeDateDebut,
          oldDateFin: currentNode.dateFin,
          newDateFin: newNodeDateFin,
          deltaJours: differenceInCalendarDays(earliestStart, nodeDateDebut),
        });
      }
    }

    return results;
  }

  // ─── Commit (ecriture) ───────────────────────────────────

  /**
   * Execute la propagation puis persiste les changements
   * en memoire et en base de donnees.
   */
  async propagateCommit(nodeId: string, newDateDebut: string): Promise<PropagationResult[]> {
    const results = this.propagatePreview(nodeId, newDateDebut);

    if (results.length === 0) return results;

    // Mettre a jour le graphe en memoire et preparer les updates DB
    const dbUpdates: Promise<unknown>[] = [];

    for (const r of results) {
      // Mise a jour memoire
      this.graph.updateNodeDates(r.nodeId, r.newDateDebut, r.newDateFin);

      // Mise a jour base de donnees
      const node = this.graph.getNode(r.nodeId);
      if (!node) continue;

      if (node.type === 'of') {
        dbUpdates.push(
          this.prisma.ordreFabrication.update({
            where: { id: r.nodeId },
            data: {
              dateDebutPrevue: new Date(r.newDateDebut),
              dateFinPrevue: new Date(r.newDateFin),
            },
          }),
        );
      } else {
        dbUpdates.push(
          this.prisma.achat.update({
            where: { id: r.nodeId },
            data: {
              dateCommande: new Date(r.newDateDebut),
              dateLivraisonPrevue: new Date(r.newDateFin),
            },
          }),
        );
      }
    }

    await Promise.all(dbUpdates);

    this.logger.log(
      `Propagation committee : ${results.length} noeuds impactes depuis ${nodeId}`,
    );

    return results;
  }
}
