import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/client';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { GraphService } from 'src/graph/services/graph.service';
import { WsGateway } from 'src/ws/ws.gateway';
import {
  ScenarioAction,
  ScenarioSnapshot,
  ScenarioKpi,
} from './_entities';
import { addDays, parseISO, differenceInCalendarDays } from 'date-fns';

@Injectable()
export class ScenarioService {
  private readonly logger = new Logger(ScenarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphService: GraphService,
    private readonly wsGateway: WsGateway,
  ) {}

  // ─── Creation ─────────────────────────────────────────────

  async create(nom?: string): Promise<{ id: string; nom: string }> {
    const nodes = this.graphService.getAllNodes().map((n) => ({ ...n }));
    const edges = this.graphService.getAllEdges().map((e) => ({ ...e }));

    const cacheMarges = await this.prisma.cacheMarge.findMany();
    const margins = cacheMarges.map((m) => ({
      nodeId: m.ofId,
      floatTotal: m.floatTotal,
      estCritique: m.estCritique,
      earlyStart: m.earlyStart?.toISOString() ?? null,
      earlyFinish: m.earlyFinish?.toISOString() ?? null,
      lateStart: m.lateStart?.toISOString() ?? null,
      lateFinish: m.lateFinish?.toISOString() ?? null,
      floatLibre: m.floatLibre,
    }));

    const snapshot: ScenarioSnapshot = {
      nodes,
      edges,
      margins,
      capturedAt: new Date().toISOString(),
    };

    const finalNom = nom || `Scenario ${new Date().toLocaleDateString('fr-FR')}`;

    const scenario = await this.prisma.scenario.create({
      data: {
        nom: finalNom,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        statut: 'brouillon',
      },
    });

    this.logger.log(`Scenario cree : ${scenario.id} (${finalNom})`);
    return { id: scenario.id, nom: scenario.nom };
  }

  // ─── Liste ────────────────────────────────────────────────

  async list() {
    return this.prisma.scenario.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nom: true,
        description: true,
        statut: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Detail ───────────────────────────────────────────────

  async getById(id: string) {
    const scenario = await this.prisma.scenario.findUnique({ where: { id } });
    if (!scenario) {
      throw new NotFoundException(`Scenario '${id}' introuvable`);
    }
    return scenario;
  }

  // ─── Application d'action ─────────────────────────────────

  async applyAction(id: string, action: ScenarioAction): Promise<ScenarioKpi> {
    const scenario = await this.prisma.scenario.findUnique({ where: { id } });
    if (!scenario) {
      throw new NotFoundException(`Scenario '${id}' introuvable`);
    }

    const snapshot = scenario.snapshot as unknown as ScenarioSnapshot;

    // Construire les structures locales
    const localNodes = new Map<string, ScenarioSnapshot['nodes'][number]>();
    for (const node of snapshot.nodes) {
      localNodes.set(node.id, { ...node });
    }

    const localOutEdges = new Map<string, ScenarioSnapshot['edges'][number][]>();
    const localInEdges = new Map<string, ScenarioSnapshot['edges'][number][]>();
    for (const edge of snapshot.edges) {
      const out = localOutEdges.get(edge.sourceId);
      if (out) out.push(edge);
      else localOutEdges.set(edge.sourceId, [edge]);

      const inp = localInEdges.get(edge.targetId);
      if (inp) inp.push(edge);
      else localInEdges.set(edge.targetId, [edge]);
    }

    // Appliquer l'action
    switch (action.type) {
      case 'shift_supplier':
        this.applyShiftSupplier(localNodes, action.fournisseur, action.deltaJours);
        break;
      case 'cancel_command':
        this.applyCancelCommand(localNodes, localOutEdges, action.rootOfId);
        break;
      case 'reduce_cadence':
        this.applyReduceCadence(localNodes, action.articleId, action.factorPct);
        break;
      case 'shift_of':
        this.applyShiftOf(localNodes, action.ofId, action.deltaJours);
        break;
    }

    // Propagation locale
    const topoOrder = this.localTopologicalSort(localNodes, localOutEdges);
    this.localPropagate(topoOrder, localNodes, localInEdges);

    // Recalcul local des marges (CPM)
    const margins = this.localCpm(topoOrder, localNodes, localOutEdges, localInEdges);

    // Mettre a jour le snapshot
    const updatedSnapshot: ScenarioSnapshot = {
      nodes: Array.from(localNodes.values()),
      edges: snapshot.edges,
      margins,
      capturedAt: new Date().toISOString(),
    };

    await this.prisma.scenario.update({
      where: { id },
      data: { snapshot: updatedSnapshot as unknown as Prisma.InputJsonValue },
    });

    const kpi = this.computeKpiFromSnapshot(updatedSnapshot);
    this.logger.log(`Action '${action.type}' appliquee au scenario ${id}`);
    return kpi;
  }

  // ─── KPI ──────────────────────────────────────────────────

  async getKpi(id: string): Promise<ScenarioKpi> {
    const scenario = await this.prisma.scenario.findUnique({ where: { id } });
    if (!scenario) {
      throw new NotFoundException(`Scenario '${id}' introuvable`);
    }

    const snapshot = scenario.snapshot as unknown as ScenarioSnapshot;
    return this.computeKpiFromSnapshot(snapshot);
  }

  // ─── Commit (appliquer en production) ─────────────────────

  async commit(id: string): Promise<void> {
    const scenario = await this.prisma.scenario.findUnique({ where: { id } });
    if (!scenario) {
      throw new NotFoundException(`Scenario '${id}' introuvable`);
    }

    const snapshot = scenario.snapshot as unknown as ScenarioSnapshot;

    // Mettre a jour chaque noeud en base
    for (const node of snapshot.nodes) {
      if (node.type === 'of') {
        await this.prisma.ordreFabrication.update({
          where: { id: node.id },
          data: {
            dateDebutPrevue: new Date(node.dateDebut),
            dateFinPrevue: new Date(node.dateFin),
            statut: node.statut as never,
          },
        }).catch(() => {
          this.logger.warn(`OF '${node.id}' introuvable lors du commit scenario`);
        });
      } else if (node.type === 'achat') {
        await this.prisma.achat.update({
          where: { id: node.id },
          data: {
            dateCommande: new Date(node.dateDebut),
            dateLivraisonPrevue: new Date(node.dateFin),
            statut: node.statut as never,
          },
        }).catch(() => {
          this.logger.warn(`Achat '${node.id}' introuvable lors du commit scenario`);
        });
      }
    }

    // Marquer le scenario comme valide
    await this.prisma.scenario.update({
      where: { id },
      data: { statut: 'valide' },
    });

    // Recharger le graphe depuis la base
    await this.graphService.loadFromDb();

    // Notifier les clients
    this.wsGateway.emitGraphUpdated({
      impactedNodes: snapshot.nodes.map((n) => ({
        nodeId: n.id,
        newDateDebut: n.dateDebut,
        newDateFin: n.dateFin,
      })),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Scenario ${id} valide et applique en production`);
  }

  // ─── Suppression (soft) ───────────────────────────────────

  async delete(id: string): Promise<void> {
    const scenario = await this.prisma.scenario.findUnique({ where: { id } });
    if (!scenario) {
      throw new NotFoundException(`Scenario '${id}' introuvable`);
    }

    await this.prisma.scenario.update({
      where: { id },
      data: { statut: 'abandonne' },
    });

    this.logger.log(`Scenario ${id} abandonne`);
  }

  // ═══════════════════════════════════════════════════════════
  // Methodes privees : actions sur le graphe local
  // ═══════════════════════════════════════════════════════════

  private applyShiftSupplier(
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    fournisseur: string,
    deltaJours: number,
  ): void {
    for (const node of nodes.values()) {
      if (node.type === 'achat' && (node as Record<string, unknown>).fournisseur === fournisseur) {
        node.dateDebut = addDays(parseISO(node.dateDebut), deltaJours).toISOString();
        node.dateFin = addDays(parseISO(node.dateFin), deltaJours).toISOString();
      }
    }
  }

  private applyCancelCommand(
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    outEdges: Map<string, ScenarioSnapshot['edges'][number][]>,
    rootOfId: string,
  ): void {
    // BFS pour trouver tous les descendants
    const visited = new Set<string>();
    const queue = [rootOfId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = nodes.get(current);
      if (node) {
        node.statut = 'ANNULE';
      }

      const successors = outEdges.get(current) ?? [];
      for (const edge of successors) {
        if (!visited.has(edge.targetId)) {
          queue.push(edge.targetId);
        }
      }
    }
  }

  private applyReduceCadence(
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    articleId: string,
    factorPct: number,
  ): void {
    for (const node of nodes.values()) {
      if (node.type === 'of' && (node as Record<string, unknown>).articleId === articleId) {
        const debut = parseISO(node.dateDebut);
        const fin = parseISO(node.dateFin);
        const durationJours = differenceInCalendarDays(fin, debut);
        const newDuration = Math.ceil(durationJours * (factorPct / 100));
        node.dateFin = addDays(debut, newDuration).toISOString();
      }
    }
  }

  private applyShiftOf(
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    ofId: string,
    deltaJours: number,
  ): void {
    const node = nodes.get(ofId);
    if (!node) return;
    node.dateDebut = addDays(parseISO(node.dateDebut), deltaJours).toISOString();
    node.dateFin = addDays(parseISO(node.dateFin), deltaJours).toISOString();
  }

  // ─── Tri topologique local (Kahn) ─────────────────────────

  private localTopologicalSort(
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    outEdges: Map<string, ScenarioSnapshot['edges'][number][]>,
  ): string[] {
    const inDegree = new Map<string, number>();
    for (const id of nodes.keys()) {
      inDegree.set(id, 0);
    }

    for (const edges of outEdges.values()) {
      for (const edge of edges) {
        if (inDegree.has(edge.targetId)) {
          inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const successors = outEdges.get(current) ?? [];
      for (const edge of successors) {
        if (inDegree.has(edge.targetId)) {
          const newDegree = (inDegree.get(edge.targetId) ?? 1) - 1;
          inDegree.set(edge.targetId, newDegree);
          if (newDegree === 0) {
            queue.push(edge.targetId);
          }
        }
      }
    }

    return sorted;
  }

  // ─── Propagation locale (forward pass) ────────────────────

  private localPropagate(
    topoOrder: string[],
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    inEdges: Map<string, ScenarioSnapshot['edges'][number][]>,
  ): void {
    for (const nodeId of topoOrder) {
      const node = nodes.get(nodeId);
      if (!node || node.statut === 'ANNULE') continue;

      const predecessors = inEdges.get(nodeId) ?? [];
      let maxPredFinish = parseISO(node.dateDebut);

      for (const edge of predecessors) {
        const predNode = nodes.get(edge.sourceId);
        if (!predNode || predNode.statut === 'ANNULE') continue;

        const predFinishPlusDelay = addDays(
          parseISO(predNode.dateFin),
          edge.delaiMinimum,
        );

        if (predFinishPlusDelay > maxPredFinish) {
          maxPredFinish = predFinishPlusDelay;
        }
      }

      // Decaler si necessaire
      const currentDebut = parseISO(node.dateDebut);
      if (maxPredFinish > currentDebut) {
        const delta = differenceInCalendarDays(maxPredFinish, currentDebut);
        node.dateDebut = maxPredFinish.toISOString();
        node.dateFin = addDays(parseISO(node.dateFin), delta).toISOString();
      }
    }
  }

  // ─── CPM local (forward + backward) ──────────────────────

  private localCpm(
    topoOrder: string[],
    nodes: Map<string, ScenarioSnapshot['nodes'][number]>,
    outEdges: Map<string, ScenarioSnapshot['edges'][number][]>,
    inEdges: Map<string, ScenarioSnapshot['edges'][number][]>,
  ): ScenarioSnapshot['margins'] {
    const earlyStart = new Map<string, number>();
    const earlyFinish = new Map<string, number>();

    // Reference : la plus petite date de debut
    let refDate: Date | null = null;
    for (const node of nodes.values()) {
      const d = parseISO(node.dateDebut);
      if (!refDate || d < refDate) refDate = d;
    }
    if (!refDate) return [];

    // Forward pass
    for (const nodeId of topoOrder) {
      const node = nodes.get(nodeId);
      if (!node) continue;

      const es = differenceInCalendarDays(parseISO(node.dateDebut), refDate);
      const ef = differenceInCalendarDays(parseISO(node.dateFin), refDate);
      earlyStart.set(nodeId, es);
      earlyFinish.set(nodeId, ef);
    }

    // Backward pass
    let projectEnd = 0;
    for (const ef of earlyFinish.values()) {
      if (ef > projectEnd) projectEnd = ef;
    }

    const lateStart = new Map<string, number>();
    const lateFinish = new Map<string, number>();

    // Initialiser tous les noeuds avec projectEnd
    for (const nodeId of nodes.keys()) {
      lateFinish.set(nodeId, projectEnd);
    }

    // Parcourir en ordre inverse
    const reverseOrder = [...topoOrder].reverse();
    for (const nodeId of reverseOrder) {
      const node = nodes.get(nodeId);
      if (!node) continue;

      const successors = outEdges.get(nodeId) ?? [];
      let minSuccStart = projectEnd;

      for (const edge of successors) {
        const succLs = lateStart.get(edge.targetId);
        if (succLs !== undefined) {
          const adjusted = succLs - edge.delaiMinimum;
          if (adjusted < minSuccStart) minSuccStart = adjusted;
        }
      }

      const duration = (earlyFinish.get(nodeId) ?? 0) - (earlyStart.get(nodeId) ?? 0);
      lateFinish.set(nodeId, minSuccStart);
      lateStart.set(nodeId, minSuccStart - duration);
    }

    // Calculer les marges
    const margins: ScenarioSnapshot['margins'] = [];
    for (const nodeId of topoOrder) {
      const es = earlyStart.get(nodeId) ?? 0;
      const ef = earlyFinish.get(nodeId) ?? 0;
      const ls = lateStart.get(nodeId) ?? 0;
      const lf = lateFinish.get(nodeId) ?? 0;
      const floatTotal = ls - es;

      margins.push({
        nodeId,
        floatTotal,
        estCritique: floatTotal === 0,
        earlyStart: addDays(refDate, es).toISOString(),
        earlyFinish: addDays(refDate, ef).toISOString(),
        lateStart: addDays(refDate, ls).toISOString(),
        lateFinish: addDays(refDate, lf).toISOString(),
      });
    }

    return margins;
  }

  // ─── Calcul KPI depuis snapshot ───────────────────────────

  private computeKpiFromSnapshot(snapshot: ScenarioSnapshot): ScenarioKpi {
    const ofNodes = snapshot.nodes.filter((n) => n.type === 'of');
    const activeOfs = ofNodes.filter((n) =>
      ['PLANIFIE', 'EN_COURS'].includes(n.statut),
    ).length;
    const lateOfs = ofNodes.filter((n) => n.statut === 'EN_RETARD').length;

    const totalMargins = snapshot.margins.length;
    const criticalCount = snapshot.margins.filter((m) => m.estCritique).length;
    const tensionPct = totalMargins > 0
      ? Math.round((criticalCount / totalMargins) * 100)
      : 0;

    return {
      activeOfs,
      lateOfs,
      tensionPct,
      coveragePct: 100,
      computedAt: new Date().toISOString(),
    };
  }
}
