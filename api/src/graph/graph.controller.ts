import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GraphService } from './services/graph.service';
import { CriticalPathService } from './services/critical-path.service';

@ApiTags('Graph')
@Controller('graph')
export class GraphController {
  constructor(
    private readonly graph: GraphService,
    private readonly criticalPath: CriticalPathService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Charger le graphe complet (noeuds, aretes, chemin critique, KPIs)' })
  async getFullGraph() {
    const nodes = this.graph.getAllNodes();
    const edges = this.graph.getAllEdges();

    // Recalculer le chemin critique pour avoir des donnees fraiches
    const { criticalNodes, margins } = await this.criticalPath.recalculate();

    // KPIs de base
    const totalOfs = nodes.filter((n) => n.type === 'of').length;
    const totalAchats = nodes.filter((n) => n.type === 'achat').length;
    const ofsEnRetard = nodes.filter((n) => n.type === 'of' && n.statut === 'EN_RETARD').length;
    const ofsCritiques = criticalNodes.filter((id) => {
      const node = this.graph.getNode(id);
      return node?.type === 'of';
    }).length;

    return {
      nodes,
      edges,
      criticalPath: criticalNodes,
      margins,
      kpis: {
        totalOfs,
        totalAchats,
        totalAretes: edges.length,
        ofsEnRetard,
        ofsCritiques,
        tauxCritique: totalOfs > 0 ? Math.round((ofsCritiques / totalOfs) * 100) : 0,
      },
    };
  }

  @Get('critical-path')
  @ApiOperation({ summary: 'Recalculer et retourner le chemin critique' })
  async getCriticalPath() {
    return this.criticalPath.recalculate();
  }

  @Get('impact-zone/:nodeId')
  @ApiOperation({ summary: 'Zone d\'impact : tous les descendants d\'un noeud' })
  getImpactZone(@Param('nodeId') nodeId: string) {
    const impactedNodes = this.graph.getSubgraph(nodeId);
    return { impactedNodes };
  }

  @Get('ancestors/:nodeId')
  @ApiOperation({ summary: 'Tous les ancetres d\'un noeud' })
  getAncestors(@Param('nodeId') nodeId: string) {
    const ancestors = this.graph.getAncestors(nodeId);
    return { ancestors };
  }

  @Post('reload')
  @ApiOperation({ summary: 'Forcer le rechargement du graphe depuis la base' })
  async reload() {
    await this.graph.loadFromDb();
    return {
      message: 'Graphe recharge',
      nodes: this.graph.getNodeCount(),
      edges: this.graph.getEdgeCount(),
    };
  }
}
