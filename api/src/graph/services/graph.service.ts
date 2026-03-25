import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { GraphNode, GraphEdge } from 'src/graph/_entities';

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

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDb();
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
}
