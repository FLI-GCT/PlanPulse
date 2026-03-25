import { Controller, Get, Post, Param, Query, Body, BadRequestException } from '@nestjs/common';
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

  @Get('strategic')
  @ApiOperation({ summary: 'Vue strategique : grouper les OF par critere (client, semaine, article, priorite)' })
  async getStrategicView(
    @Query('groupBy') groupBy: string,
  ) {
    const validGroupBy = ['client', 'semaine', 'article', 'priorite'] as const;
    if (!validGroupBy.includes(groupBy as typeof validGroupBy[number])) {
      throw new BadRequestException(
        `Parametre groupBy invalide : '${groupBy}'. Valeurs acceptees : ${validGroupBy.join(', ')}`,
      );
    }
    return this.graph.getStrategicView(groupBy as 'client' | 'semaine' | 'article' | 'priorite');
  }

  @Get('flows')
  @ApiOperation({ summary: 'Vue flux : tracer le chemin complet de chaque commande client' })
  async getFlowsView() {
    return this.graph.getFlowsView();
  }

  @Get('subgraph')
  @ApiOperation({ summary: 'Extraction de sous-graphe parametrique avec gestion des achats partages' })
  getSubgraphParametric(
    @Query('rootId') rootId: string,
    @Query('depth') depthStr: string,
    @Query('direction') direction: string,
  ) {
    if (!rootId) {
      throw new BadRequestException('Parametre rootId requis');
    }

    const depth = depthStr ? parseInt(depthStr, 10) : 3;
    if (isNaN(depth) || depth < 1 || depth > 20) {
      throw new BadRequestException('Parametre depth doit etre un entier entre 1 et 20');
    }

    const validDirections = ['ancestors', 'descendants', 'both'] as const;
    const dir = (direction ?? 'both') as typeof validDirections[number];
    if (!validDirections.includes(dir)) {
      throw new BadRequestException(
        `Parametre direction invalide : '${direction}'. Valeurs acceptees : ${validDirections.join(', ')}`,
      );
    }

    const node = this.graph.getNode(rootId);
    if (!node) {
      throw new BadRequestException(`Noeud '${rootId}' introuvable dans le graphe`);
    }

    return this.graph.getParametricSubgraph(rootId, depth, dir);
  }

  @Post('question')
  @ApiOperation({ summary: 'Repondre a une question contextuelle sur le graphe (why-late, what-depends, critical-week, endangered-purchases)' })
  async answerQuestion(
    @Body() body: { type: string; targetId?: string; params?: { delta?: number; week?: string } },
  ) {
    if (!body.type) {
      throw new BadRequestException('Le champ type est requis');
    }
    return this.graph.answerQuestion(body.type, body.targetId, body.params);
  }
}
