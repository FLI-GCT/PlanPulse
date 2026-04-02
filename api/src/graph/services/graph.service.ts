import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { parseISO, getISOWeek, differenceInCalendarDays } from 'date-fns';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { GraphNode, GraphEdge } from 'src/graph/_entities';
import { CriticalPathService } from 'src/graph/services/critical-path.service';
import { AllocationService } from 'src/graph/services/allocation.service';

/**
 * Service singleton maintenant le DAG de production en memoire.
 * Charge depuis la base au demarrage, puis mis a jour incrementalement.
 */
@Injectable()
export class GraphService implements OnModuleInit {
  private readonly logger = new Logger(GraphService.name);

  /** Tous les noeuds (OF + Achat) indexes par ID */
  readonly nodes = new Map<string, GraphNode>();
  /** Aretes sortantes : sourceId -> edges[] */
  readonly outEdges = new Map<string, GraphEdge[]>();
  /** Aretes entrantes : targetId -> edges[] */
  readonly inEdges = new Map<string, GraphEdge[]>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CriticalPathService))
    private readonly criticalPathService: CriticalPathService,
    @Inject(forwardRef(() => AllocationService))
    private readonly allocationService: AllocationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDb();

    // Recalculate CPM and allocations at startup
    try {
      await this.criticalPathService.recalculate();
      this.logger.log('Chemin critique recalcule au demarrage');
    } catch (e) {
      this.logger.error('Erreur recalcul CPM au demarrage', e);
    }
    try {
      await this.allocationService.allocateAll();
      this.logger.log('Allocations recalculees au demarrage');
    } catch (e) {
      this.logger.error('Erreur recalcul allocations au demarrage', e);
    }
  }

  // ─── Chargement initial ──────────────────────────────────

  async loadFromDb(): Promise<void> {
    const t0 = Date.now();

    this.nodes.clear();
    this.outEdges.clear();
    this.inEdges.clear();

    // Charger les OF
    const ofs = await this.prisma.ordreFabrication.findMany({
      include: { article: true },
    });

    for (const of_ of ofs) {
      const node: GraphNode = {
        id: of_.id,
        type: 'of',
        label: of_.article?.label ?? of_.id,
        articleId: of_.articleId,
        dateDebut: of_.dateDebutPrevue.toISOString(),
        dateFin: of_.dateFinPrevue.toISOString(),
        statut: of_.statut,
        priorite: of_.priorite,
        quantite: of_.quantite,
        version: 0,
      };
      this.nodes.set(node.id, node);
    }

    // Charger les Achats
    const achats = await this.prisma.achat.findMany({
      include: { article: true },
    });

    for (const achat of achats) {
      const node: GraphNode = {
        id: achat.id,
        type: 'achat',
        label: achat.article?.label ?? achat.id,
        articleId: achat.articleId,
        dateDebut: achat.dateCommande.toISOString(),
        dateFin: achat.dateLivraisonPrevue.toISOString(),
        statut: achat.statut,
        priorite: null,
        quantite: achat.quantite,
        fournisseur: achat.fournisseur,
        version: 0,
      };
      this.nodes.set(node.id, node);
    }

    // Charger les dependances (aretes du DAG)
    const deps = await this.prisma.dependance.findMany();

    for (const dep of deps) {
      const edge: GraphEdge = {
        sourceId: dep.sourceId,
        sourceType: dep.sourceType,
        targetId: dep.targetId,
        targetType: dep.targetType,
        typeLien: dep.typeLien,
        quantite: dep.quantite,
        delaiMinimum: dep.delaiMinimum,
      };

      // Aretes sortantes
      const out = this.outEdges.get(edge.sourceId);
      if (out) {
        out.push(edge);
      } else {
        this.outEdges.set(edge.sourceId, [edge]);
      }

      // Aretes entrantes
      const inp = this.inEdges.get(edge.targetId);
      if (inp) {
        inp.push(edge);
      } else {
        this.inEdges.set(edge.targetId, [edge]);
      }
    }

    const elapsed = Date.now() - t0;
    this.logger.log(
      `DAG charge : ${this.nodes.size} noeuds, ${deps.length} aretes en ${elapsed}ms`,
    );
  }

  // ─── Accesseurs ──────────────────────────────────────────

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getSuccessors(id: string): GraphEdge[] {
    return this.outEdges.get(id) ?? [];
  }

  getPredecessors(id: string): GraphEdge[] {
    return this.inEdges.get(id) ?? [];
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const arr of this.outEdges.values()) {
      edges.push(...arr);
    }
    return edges;
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    let count = 0;
    for (const arr of this.outEdges.values()) {
      count += arr.length;
    }
    return count;
  }

  // ─── Sous-graphe (descendants) ────────────────────────────

  /** BFS suivant les aretes sortantes - retourne tous les noeuds atteignables */
  getSubgraph(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.getSuccessors(current)) {
        if (!visited.has(edge.targetId)) {
          queue.push(edge.targetId);
        }
      }
    }

    return Array.from(visited);
  }

  // ─── Ancetres (predecesseurs) ─────────────────────────────

  /** BFS suivant les aretes entrantes */
  getAncestors(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.getPredecessors(current)) {
        if (!visited.has(edge.sourceId)) {
          queue.push(edge.sourceId);
        }
      }
    }

    return Array.from(visited);
  }

  // ─── Tri topologique (Kahn) ───────────────────────────────

  topologicalSort(): string[] {
    // Calculer le degre entrant de chaque noeud
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }

    for (const edges of this.outEdges.values()) {
      for (const edge of edges) {
        inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
      }
    }

    // File des noeuds sans predecesseur
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

      for (const edge of this.getSuccessors(current)) {
        const newDegree = (inDegree.get(edge.targetId) ?? 1) - 1;
        inDegree.set(edge.targetId, newDegree);
        if (newDegree === 0) {
          queue.push(edge.targetId);
        }
      }
    }

    // Si sorted.length < nodes.size, il y a un cycle (ne devrait pas arriver dans un DAG valide)
    if (sorted.length < this.nodes.size) {
      this.logger.warn(
        `Cycle detecte dans le DAG : ${sorted.length} noeuds tries sur ${this.nodes.size}`,
      );
    }

    return sorted;
  }

  // ─── Mise a jour ─────────────────────────────────────────

  updateNodeDates(nodeId: string, newDateDebut: string, newDateFin: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.dateDebut = newDateDebut;
    node.dateFin = newDateFin;
    node.version += 1;
  }

  // ─── Multi-scale: Strategic View ─────────────────────────

  /**
   * Trouve l'OF racine (sans parent OF) en remontant les aretes NOMENCLATURE.
   * Retourne l'ID du noeud racine.
   */
  findRootOfId(nodeId: string): string {
    const visited = new Set<string>();
    let current = nodeId;

    while (true) {
      if (visited.has(current)) break;
      visited.add(current);

      const node = this.nodes.get(current);
      if (!node || node.type !== 'of') break;

      const preds = this.getPredecessors(current);
      const parentEdge = preds.find(
        (e) => e.typeLien === 'NOMENCLATURE' && this.nodes.get(e.sourceId)?.type === 'of',
      );
      if (!parentEdge) break;
      current = parentEdge.sourceId;
    }

    return current;
  }

  /**
   * Vue strategique : grouper les OF par critere et calculer les metriques.
   */
  async getStrategicView(groupBy: 'client' | 'semaine' | 'article' | 'priorite') {
    const ofNodes = this.getAllNodes().filter((n) => n.type === 'of');

    // Construire la map root pour chaque OF
    const rootMap = new Map<string, string>(); // ofId -> rootOfId
    for (const n of ofNodes) {
      rootMap.set(n.id, this.findRootOfId(n.id));
    }

    // Charger les marges depuis la DB
    const marges = await this.prisma.cacheMarge.findMany();
    const margeMap = new Map<string, { floatTotal: number; estCritique: boolean }>();
    for (const m of marges) {
      margeMap.set(m.ofId, { floatTotal: m.floatTotal, estCritique: m.estCritique });
    }

    // Charger les alertes
    const alertes = await this.prisma.alerte.findMany({ where: { dismissed: false } });

    // Charger les infos clients des root OFs depuis la DB
    const rootOfIds = [...new Set(rootMap.values())];
    const rootOfsDb = await this.prisma.ordreFabrication.findMany({
      where: { id: { in: rootOfIds } },
      select: { id: true, clientNom: true },
    });
    const clientMap = new Map<string, string>();
    for (const r of rootOfsDb) {
      clientMap.set(r.id, r.clientNom ?? r.id);
    }

    // Grouper les OF
    const groups = new Map<string, GraphNode[]>();
    for (const n of ofNodes) {
      let key: string;
      switch (groupBy) {
        case 'client': {
          const rootId = rootMap.get(n.id)!;
          key = clientMap.get(rootId) ?? 'Inconnu';
          break;
        }
        case 'semaine': {
          const week = getISOWeek(parseISO(n.dateDebut));
          const year = parseISO(n.dateDebut).getFullYear();
          key = `${year}-S${String(week).padStart(2, '0')}`;
          break;
        }
        case 'article':
          key = n.articleId ?? 'Sans article';
          break;
        case 'priorite':
          key = `P${n.priorite ?? 0}`;
          break;
      }

      const arr = groups.get(key) ?? [];
      arr.push(n);
      groups.set(key, arr);
    }

    // Construire les groupes strategiques
    const strategicGroups: Array<{
      id: string;
      label: string;
      ofCount: number;
      avgMargin: number;
      minMargin: number;
      alertCount: number;
      hasCriticalPath: boolean;
      ofIds: string[];
      temporalCenter: string;
    }> = [];

    for (const [key, ofs] of groups) {
      const ofIds = ofs.map((o) => o.id);
      const ofIdSet = new Set(ofIds);

      // Marges
      const margins = ofIds
        .map((id) => margeMap.get(id))
        .filter((m): m is { floatTotal: number; estCritique: boolean } => m !== undefined);
      const avgMargin = margins.length > 0
        ? Math.round((margins.reduce((s, m) => s + m.floatTotal, 0) / margins.length) * 10) / 10
        : 0;
      const minMargin = margins.length > 0
        ? Math.min(...margins.map((m) => m.floatTotal))
        : 0;
      const hasCriticalPath = margins.some((m) => m.estCritique);

      // Alertes qui concernent ce groupe
      let alertCount = 0;
      for (const a of alertes) {
        const noeuds = a.noeuds as string[];
        if (Array.isArray(noeuds) && noeuds.some((nid) => ofIdSet.has(nid))) {
          alertCount++;
        }
      }

      // Centre temporel (moyenne des dateDebut)
      const timestamps = ofs.map((o) => parseISO(o.dateDebut).getTime());
      const avgTimestamp = timestamps.reduce((s, t) => s + t, 0) / timestamps.length;
      const temporalCenter = new Date(avgTimestamp).toISOString();

      strategicGroups.push({
        id: key,
        label: key,
        ofCount: ofs.length,
        avgMargin,
        minMargin,
        alertCount,
        hasCriticalPath,
        ofIds,
        temporalCenter,
      });
    }

    // Construire les liens entre groupes via achats partages
    const strategicLinks: Array<{
      sourceGroupId: string;
      targetGroupId: string;
      sharedDependencyCount: number;
      hasDelayedDependency: boolean;
    }> = [];

    // Pour chaque achat, trouver quels groupes y sont connectes
    const achatNodes = this.getAllNodes().filter((n) => n.type === 'achat');
    const ofToGroup = new Map<string, string>();
    for (const [key, ofs] of groups) {
      for (const o of ofs) {
        ofToGroup.set(o.id, key);
      }
    }

    // Map: achatId -> Set de groupIds
    const achatGroupLinks = new Map<string, Set<string>>();
    for (const achat of achatNodes) {
      // Trouver les OF connectes a cet achat (successeurs)
      const succs = this.getSuccessors(achat.id);
      const preds = this.getPredecessors(achat.id);
      const connectedOfs = new Set<string>();

      for (const e of [...succs, ...preds]) {
        const otherId = e.sourceId === achat.id ? e.targetId : e.sourceId;
        const otherNode = this.nodes.get(otherId);
        if (otherNode?.type === 'of') {
          connectedOfs.add(otherId);
        }
      }

      const connectedGroups = new Set<string>();
      for (const ofId of connectedOfs) {
        const g = ofToGroup.get(ofId);
        if (g) connectedGroups.add(g);
      }

      if (connectedGroups.size > 1) {
        achatGroupLinks.set(achat.id, connectedGroups);
      }
    }

    // Aggreger les liens inter-groupes
    const linkMap = new Map<string, { count: number; hasDelayed: boolean }>();
    for (const [achatId, groupIds] of achatGroupLinks) {
      const arr = [...groupIds].sort();
      const achatNode = this.nodes.get(achatId);
      const isDelayed = achatNode?.statut === 'EN_RETARD';

      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const linkKey = `${arr[i]}|||${arr[j]}`;
          const existing = linkMap.get(linkKey);
          if (existing) {
            existing.count++;
            if (isDelayed) existing.hasDelayed = true;
          } else {
            linkMap.set(linkKey, { count: 1, hasDelayed: isDelayed ?? false });
          }
        }
      }
    }

    for (const [key, val] of linkMap) {
      const [source, target] = key.split('|||');
      strategicLinks.push({
        sourceGroupId: source,
        targetGroupId: target,
        sharedDependencyCount: val.count,
        hasDelayedDependency: val.hasDelayed,
      });
    }

    return { groups: strategicGroups, links: strategicLinks };
  }

  // ─── Multi-scale: Flows View ──────────────────────────────

  /**
   * Vue flux : pour chaque commande client (root OF), tracer le chemin complet.
   */
  async getFlowsView() {
    const allNodes = this.getAllNodes();
    const ofNodes = allNodes.filter((n) => n.type === 'of');

    // Trouver les root OFs (pas de parent OF via edges NOMENCLATURE)
    const rootOfs: GraphNode[] = [];
    for (const n of ofNodes) {
      const preds = this.getPredecessors(n.id);
      const hasParentOf = preds.some(
        (e) => e.typeLien === 'NOMENCLATURE' && this.nodes.get(e.sourceId)?.type === 'of',
      );
      if (!hasParentOf) {
        rootOfs.push(n);
      }
    }

    // Charger les infos DB pour les root OFs
    const rootOfIds = rootOfs.map((r) => r.id);
    const rootOfsDb = await this.prisma.ordreFabrication.findMany({
      where: { id: { in: rootOfIds } },
      select: { id: true, clientNom: true, clientRef: true },
    });
    const dbMap = new Map(rootOfsDb.map((r) => [r.id, r]));

    // Charger les marges
    const marges = await this.prisma.cacheMarge.findMany({
      where: { ofId: { in: rootOfIds } },
    });
    const margeMap = new Map(marges.map((m) => [m.ofId, m.floatTotal]));

    // Pour chaque root OF, construire le flux
    const flows: Array<{
      clientName: string;
      clientRef: string;
      ofFinalId: string;
      componentCount: number;
      tension: 'ok' | 'warning' | 'critical' | 'late';
      margin: number;
      waypoints: Array<{
        type: 'achat' | 'sous_of' | 'assemblage' | 'jalon';
        id: string;
        label: string;
        date: string;
        status: string;
      }>;
    }> = [];

    // Track which achats appear in multiple flows
    const achatFlowMap = new Map<string, string[]>(); // achatId -> ofFinalId[]

    for (const root of rootOfs) {
      const dbInfo = dbMap.get(root.id);
      const clientName = dbInfo?.clientNom ?? root.label;
      const clientRef = dbInfo?.clientRef ?? '';

      // Trouver sous-OFs (successeurs directs via NOMENCLATURE)
      const subOfs: GraphNode[] = [];
      const achats: GraphNode[] = [];
      const visited = new Set<string>();

      const collectComponents = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const succs = this.getSuccessors(nodeId);
        for (const edge of succs) {
          const target = this.nodes.get(edge.targetId);
          if (!target) continue;

          if (target.type === 'of' && edge.typeLien === 'NOMENCLATURE') {
            subOfs.push(target);
            collectComponents(target.id);
          } else if (target.type === 'achat') {
            achats.push(target);
          }
        }

        // Aussi verifier les predecesseurs (achats qui alimentent cet OF)
        const preds = this.getPredecessors(nodeId);
        for (const edge of preds) {
          const source = this.nodes.get(edge.sourceId);
          if (source?.type === 'achat' && !visited.has(source.id)) {
            achats.push(source);
            visited.add(source.id);
          }
        }
      };

      collectComponents(root.id);

      // Track achats pour shared purchases
      for (const a of achats) {
        const existing = achatFlowMap.get(a.id) ?? [];
        existing.push(root.id);
        achatFlowMap.set(a.id, existing);
      }

      // Construire les waypoints
      const waypoints: Array<{
        type: 'achat' | 'sous_of' | 'assemblage' | 'jalon';
        id: string;
        label: string;
        date: string;
        status: string;
      }> = [];

      for (const a of achats) {
        waypoints.push({
          type: 'achat',
          id: a.id,
          label: a.label,
          date: a.dateDebut,
          status: a.statut,
        });
      }

      for (const s of subOfs) {
        waypoints.push({
          type: 'sous_of',
          id: s.id,
          label: s.label,
          date: s.dateDebut,
          status: s.statut,
        });
      }

      waypoints.push({
        type: 'assemblage',
        id: root.id,
        label: root.label,
        date: root.dateDebut,
        status: root.statut,
      });

      // Trier par date
      waypoints.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

      // Tension basee sur la marge
      const margin = margeMap.get(root.id) ?? 0;
      let tension: 'ok' | 'warning' | 'critical' | 'late';
      if (margin < 0) tension = 'late';
      else if (margin <= 1) tension = 'critical';
      else if (margin <= 5) tension = 'warning';
      else tension = 'ok';

      flows.push({
        clientName,
        clientRef,
        ofFinalId: root.id,
        componentCount: subOfs.length + achats.length,
        tension,
        margin,
        waypoints,
      });
    }

    // Shared purchases
    const sharedPurchases: Array<{
      achatId: string;
      articleLabel: string;
      status: string;
      flowsConnected: string[];
      isDelayed: boolean;
      isPenury: boolean;
    }> = [];

    for (const [achatId, flowIds] of achatFlowMap) {
      if (flowIds.length > 1) {
        const achatNode = this.nodes.get(achatId);
        if (!achatNode) continue;

        sharedPurchases.push({
          achatId,
          articleLabel: achatNode.label,
          status: achatNode.statut,
          flowsConnected: flowIds,
          isDelayed: achatNode.statut === 'EN_RETARD',
          isPenury: false, // Sera affine avec les alertes de penurie
        });
      }
    }

    // Verifier penurie via alertes
    const penurieAlertes = await this.prisma.alerte.findMany({
      where: { type: 'penurie', dismissed: false },
    });
    const penurieNodeIds = new Set<string>();
    for (const a of penurieAlertes) {
      const noeuds = a.noeuds as string[];
      if (Array.isArray(noeuds)) {
        for (const nid of noeuds) penurieNodeIds.add(nid);
      }
    }
    for (const sp of sharedPurchases) {
      if (penurieNodeIds.has(sp.achatId)) {
        sp.isPenury = true;
      }
    }

    return { flows, sharedPurchases };
  }

  // ─── Multi-scale: Parametric Subgraph ─────────────────────

  /**
   * Extraction de sous-graphe parametrique avec gestion des achats partages.
   */
  getParametricSubgraph(
    rootId: string,
    depth: number,
    direction: 'ancestors' | 'descendants' | 'both',
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const visitedNodes = new Set<string>();
    const collectedEdges: GraphEdge[] = [];

    // Trouver le root parent du noeud de depart (pour filtrer les achats partages)
    const startRootId = this.findRootOfId(rootId);

    const traverse = (
      nodeId: string,
      currentDepth: number,
      dir: 'ancestors' | 'descendants',
    ) => {
      if (currentDepth > depth) return;
      if (visitedNodes.has(`${nodeId}:${dir}:${currentDepth}`)) return;
      visitedNodes.add(nodeId);

      // Marquer comme visite pour cette direction/profondeur
      const trackKey = `${nodeId}:${dir}:${currentDepth}`;
      visitedNodes.add(trackKey);

      if (dir === 'descendants') {
        const succs = this.getSuccessors(nodeId);
        for (const edge of succs) {
          const targetNode = this.nodes.get(edge.targetId);
          if (!targetNode) continue;

          // Regle des achats partages : si on arrive sur un achat partage,
          // ne suivre que les OF qui partagent le meme root parent
          if (targetNode.type === 'achat' && edge.typeLien === 'PARTAGE') {
            if (!visitedNodes.has(targetNode.id)) {
              visitedNodes.add(targetNode.id);
              collectedEdges.push(edge);

              // Depuis cet achat, ne suivre que les OF du meme root
              const achatSuccs = this.getSuccessors(targetNode.id);
              for (const aEdge of achatSuccs) {
                const downstreamNode = this.nodes.get(aEdge.targetId);
                if (downstreamNode?.type === 'of') {
                  const downstreamRoot = this.findRootOfId(aEdge.targetId);
                  if (downstreamRoot === startRootId) {
                    collectedEdges.push(aEdge);
                    traverse(aEdge.targetId, currentDepth + 1, dir);
                  }
                }
              }
            }
          } else {
            collectedEdges.push(edge);
            traverse(edge.targetId, currentDepth + 1, dir);
          }
        }
      } else {
        // ancestors : pas de restriction
        const preds = this.getPredecessors(nodeId);
        for (const edge of preds) {
          if (!this.nodes.has(edge.sourceId)) continue;
          collectedEdges.push(edge);
          traverse(edge.sourceId, currentDepth + 1, dir);
        }
      }
    };

    visitedNodes.add(rootId);

    if (direction === 'both' || direction === 'descendants') {
      traverse(rootId, 1, 'descendants');
    }
    if (direction === 'both' || direction === 'ancestors') {
      traverse(rootId, 1, 'ancestors');
    }

    // Construire les noeuds et aretes uniques
    const nodeList: GraphNode[] = [];
    const addedNodes = new Set<string>();
    for (const nid of visitedNodes) {
      // Filtrer les cles de tracking (contiennent ':')
      if (nid.includes(':')) continue;
      const node = this.nodes.get(nid);
      if (node && !addedNodes.has(nid)) {
        nodeList.push(node);
        addedNodes.add(nid);
      }
    }

    // Dedupliquer les aretes
    const edgeSet = new Set<string>();
    const uniqueEdges: GraphEdge[] = [];
    for (const e of collectedEdges) {
      const key = `${e.sourceId}→${e.targetId}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        uniqueEdges.push(e);
      }
    }

    return { nodes: nodeList, edges: uniqueEdges };
  }

  // ─── Multi-scale: Question Answering ──────────────────────

  /**
   * Repondre a une question contextuelle sur le graphe.
   */
  async answerQuestion(
    type: string,
    targetId?: string,
    params?: { delta?: number; week?: string },
  ): Promise<{
    question: string;
    answer: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    highlights: Array<{
      nodeId: string;
      role: 'cause' | 'victim' | 'bottleneck' | 'solution';
      label: string;
    }>;
  }> {
    switch (type) {
      case 'why-late':
        return this.answerWhyLate(targetId!);
      case 'what-depends':
        return this.answerWhatDepends(targetId!);
      case 'critical-week':
        return this.answerCriticalWeek(params?.week ?? '');
      case 'endangered-purchases':
        return this.answerEndangeredPurchases();
      default:
        return {
          question: type,
          answer: `Type de question inconnu : ${type}`,
          nodes: [],
          edges: [],
          highlights: [],
        };
    }
  }

  private answerWhyLate(targetId: string): {
    question: string;
    answer: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }>;
  } {
    const targetNode = this.nodes.get(targetId);
    if (!targetNode) {
      return {
        question: `Pourquoi ${targetId} est en retard ?`,
        answer: `Noeud ${targetId} introuvable`,
        nodes: [],
        edges: [],
        highlights: [],
      };
    }

    const chain: Array<{ nodeId: string; delay: number }> = [];
    const collectedNodes: GraphNode[] = [targetNode];
    const collectedEdges: GraphEdge[] = [];
    const highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }> = [];

    highlights.push({ nodeId: targetId, role: 'victim', label: targetNode.label });

    let currentId = targetId;
    for (let depth = 0; depth < 5; depth++) {
      const preds = this.getPredecessors(currentId);
      if (preds.length === 0) break;

      const currentNode = this.nodes.get(currentId);
      if (!currentNode) break;
      const currentStart = parseISO(currentNode.dateDebut);

      // Trouver le pire violateur
      let worstEdge: GraphEdge | null = null;
      let worstDelay = -Infinity;

      for (const edge of preds) {
        const predNode = this.nodes.get(edge.sourceId);
        if (!predNode) continue;

        const predEnd = parseISO(predNode.dateFin);
        const requiredStart = new Date(predEnd.getTime() + edge.delaiMinimum * 86400000);
        const delay = differenceInCalendarDays(requiredStart, currentStart);

        if (delay > worstDelay) {
          worstDelay = delay;
          worstEdge = edge;
        }
      }

      if (!worstEdge || worstDelay <= 0) break;

      const bottleneckNode = this.nodes.get(worstEdge.sourceId);
      if (!bottleneckNode) break;

      chain.push({ nodeId: worstEdge.sourceId, delay: worstDelay });
      collectedNodes.push(bottleneckNode);
      collectedEdges.push(worstEdge);
      highlights.push({
        nodeId: worstEdge.sourceId,
        role: 'bottleneck',
        label: `${bottleneckNode.label} : retard de ${worstDelay}j`,
      });

      currentId = worstEdge.sourceId;
    }

    const rootCause = chain.length > 0 ? chain[chain.length - 1] : null;
    const rootNode = rootCause ? this.nodes.get(rootCause.nodeId) : null;
    const answer = rootCause && rootNode
      ? `${targetNode.label} est en retard a cause de ${rootNode.label} : retard de ${rootCause.delay} jours`
      : `${targetNode.label} n'a pas de predecesseur en retard identifie`;

    return {
      question: `Pourquoi ${targetNode.label} est en retard ?`,
      answer,
      nodes: collectedNodes,
      edges: collectedEdges,
      highlights,
    };
  }

  private answerWhatDepends(targetId: string): {
    question: string;
    answer: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }>;
  } {
    const targetNode = this.nodes.get(targetId);
    if (!targetNode) {
      return {
        question: `Que depend de ${targetId} ?`,
        answer: `Noeud ${targetId} introuvable`,
        nodes: [],
        edges: [],
        highlights: [],
      };
    }

    // BFS descendants avec profondeur limitee a 3
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: targetId, depth: 0 }];
    const collectedNodes: GraphNode[] = [targetNode];
    const collectedEdges: GraphEdge[] = [];
    const highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }> = [];

    highlights.push({ nodeId: targetId, role: 'cause', label: targetNode.label });
    visited.add(targetId);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= 3) continue;

      const succs = this.getSuccessors(id);
      for (const edge of succs) {
        if (visited.has(edge.targetId)) continue;
        visited.add(edge.targetId);

        const node = this.nodes.get(edge.targetId);
        if (!node) continue;

        collectedNodes.push(node);
        collectedEdges.push(edge);

        if (depth === 0) {
          highlights.push({ nodeId: edge.targetId, role: 'victim', label: node.label });
        }

        queue.push({ id: edge.targetId, depth: depth + 1 });
      }
    }

    const dependentCount = collectedNodes.length - 1;
    return {
      question: `Que depend de ${targetNode.label} ?`,
      answer: `${dependentCount} noeuds dependent de ${targetNode.label}`,
      nodes: collectedNodes,
      edges: collectedEdges,
      highlights,
    };
  }

  private answerCriticalWeek(week: string): {
    question: string;
    answer: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }>;
  } {
    // Trouver les noeuds critiques (marge = 0 approximativement)
    // On utilise les marges en memoire du CriticalPathService
    // mais ici on travaille en standalone - on se base sur les noeuds du graphe
    const allNodes = this.getAllNodes();
    const allEdges = this.getAllEdges();

    // Filtrer par semaine ISO
    // week format attendu : "2026-S13" ou "S13"
    let targetWeek: number | null = null;
    let targetYear: number | null = null;
    const match = week.match(/(\d{4})-S(\d{1,2})/);
    if (match) {
      targetYear = parseInt(match[1]);
      targetWeek = parseInt(match[2]);
    } else {
      const matchSimple = week.match(/S?(\d{1,2})/);
      if (matchSimple) {
        targetWeek = parseInt(matchSimple[1]);
        targetYear = new Date().getFullYear();
      }
    }

    if (targetWeek === null) {
      return {
        question: `Noeuds critiques en semaine ${week} ?`,
        answer: `Format de semaine invalide : ${week}`,
        nodes: [],
        edges: [],
        highlights: [],
      };
    }

    const weekNodes = allNodes.filter((n) => {
      const d = parseISO(n.dateDebut);
      return getISOWeek(d) === targetWeek && d.getFullYear() === targetYear;
    });

    // Parmi ceux-la, identifier les critiques (pas de marge via analyse des aretes)
    // On retourne tous les noeuds de la semaine et on les marquera
    const highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }> = [];
    for (const n of weekNodes) {
      highlights.push({ nodeId: n.id, role: 'cause', label: n.label });
    }

    // Collecter les aretes entre ces noeuds
    const nodeIds = new Set(weekNodes.map((n) => n.id));
    const relevantEdges = allEdges.filter(
      (e) => nodeIds.has(e.sourceId) || nodeIds.has(e.targetId),
    );

    return {
      question: `Noeuds critiques en semaine ${week} ?`,
      answer: `${weekNodes.length} noeuds en semaine ${week}`,
      nodes: weekNodes,
      edges: relevantEdges,
      highlights,
    };
  }

  private answerEndangeredPurchases(): {
    question: string;
    answer: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }>;
  } {
    const allNodes = this.getAllNodes();
    const delayedAchats = allNodes.filter(
      (n) => n.type === 'achat' && n.statut === 'EN_RETARD',
    );

    const collectedNodes: GraphNode[] = [...delayedAchats];
    const collectedEdges: GraphEdge[] = [];
    const highlights: Array<{ nodeId: string; role: 'cause' | 'victim' | 'bottleneck' | 'solution'; label: string }> = [];
    const impactedOfIds = new Set<string>();

    for (const achat of delayedAchats) {
      highlights.push({ nodeId: achat.id, role: 'cause', label: achat.label });

      // Trouver les OF qui en dependent (successeurs)
      const succs = this.getSuccessors(achat.id);
      for (const edge of succs) {
        const node = this.nodes.get(edge.targetId);
        if (node?.type === 'of') {
          if (!impactedOfIds.has(node.id)) {
            impactedOfIds.add(node.id);
            collectedNodes.push(node);
            highlights.push({ nodeId: node.id, role: 'victim', label: node.label });
          }
          collectedEdges.push(edge);
        }
      }
    }

    return {
      question: 'Quels achats sont en danger ?',
      answer: `${delayedAchats.length} achats en danger impactant ${impactedOfIds.size} OF`,
      nodes: collectedNodes,
      edges: collectedEdges,
      highlights,
    };
  }
}
