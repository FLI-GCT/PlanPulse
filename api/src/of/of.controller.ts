import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { PropagationService } from 'src/graph/services/propagation.service';
import { CriticalPathService } from 'src/graph/services/critical-path.service';
import { GraphService } from 'src/graph/services/graph.service';
import { OfApi } from './_contract';

@ApiTags('OF')
@Controller('of')
export class OfController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propagationService: PropagationService,
    private readonly criticalPathService: CriticalPathService,
    private readonly graphService: GraphService,
  ) {}

  @Get('commandes-clients')
  @ApiOperation({ summary: 'Lister les commandes clients (OF racines) avec marges et compteurs' })
  async getCommandesClients() {
    const rootOfs = await this.prisma.ordreFabrication.findMany({
      where: { parentOfId: null },
      include: {
        article: true,
        cacheMarge: true,
        sousOfs: { select: { id: true } },
      },
      orderBy: { dateDebutPrevue: 'asc' },
    });

    // Compter les achats par OF racine via les aretes du graphe en memoire
    const result: Array<{
      clientNom: string;
      clientRef: string;
      ofFinalId: string;
      articleLabel: string;
      dateDebut: string;
      dateFin: string;
      margin: number;
      status: string;
      alertCount: number;
      sousOfCount: number;
      achatCount: number;
    }> = [];
    for (const of_ of rootOfs) {
      // Compter les achats via le graphe : parcourir les descendants et compter les achats
      let achatCount = 0;
      const visited = new Set<string>();
      const queue = [of_.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const succs = this.graphService.getSuccessors(current);
        const preds = this.graphService.getPredecessors(current);
        for (const edge of [...succs, ...preds]) {
          const otherId = edge.sourceId === current ? edge.targetId : edge.sourceId;
          if (visited.has(otherId)) continue;
          const node = this.graphService.getNode(otherId);
          if (!node) continue;
          if (node.type === 'achat') {
            achatCount++;
            visited.add(otherId);
          } else if (node.type === 'of' && edge.typeLien === 'NOMENCLATURE') {
            queue.push(otherId);
          }
        }
      }

      // Compter les alertes pour cet OF
      const alertes = await this.prisma.alerte.findMany({
        where: { dismissed: false },
      });
      let alertCount = 0;
      for (const a of alertes) {
        const noeuds = a.noeuds as string[];
        if (Array.isArray(noeuds) && noeuds.includes(of_.id)) {
          alertCount++;
        }
      }

      result.push({
        clientNom: of_.clientNom ?? of_.article?.label ?? of_.id,
        clientRef: of_.clientRef ?? '',
        ofFinalId: of_.id,
        articleLabel: of_.article?.label ?? '',
        dateDebut: of_.dateDebutPrevue.toISOString(),
        dateFin: of_.dateFinPrevue.toISOString(),
        margin: of_.cacheMarge?.floatTotal ?? 0,
        status: of_.statut,
        alertCount,
        sousOfCount: of_.sousOfs.length,
        achatCount,
      });
    }

    return { data: result };
  }

  @Get()
  @ApiOperation({ summary: 'Lister les ordres de fabrication avec pagination et filtres' })
  async list(@Query() query: OfApi.OfListRequest) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (query.statut) {
      where.statut = query.statut;
    }
    if (query.priorite !== undefined) {
      where.priorite = query.priorite;
    }
    if (query.client) {
      where.clientNom = { contains: query.client, mode: 'insensitive' };
    }
    if (query.dateDebut || query.dateFin) {
      where.dateDebutPrevue = {};
      if (query.dateDebut) {
        (where.dateDebutPrevue as Record<string, unknown>).gte = query.dateDebut;
      }
      if (query.dateFin) {
        (where.dateDebutPrevue as Record<string, unknown>).lte = query.dateFin;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.ordreFabrication.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ priorite: 'asc' }, { dateDebutPrevue: 'asc' }],
        include: { article: true },
      }),
      this.prisma.ordreFabrication.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d\'un OF avec ses dependances' })
  async detail(@Param('id') id: string) {
    const of = await this.prisma.ordreFabrication.findUnique({
      where: { id },
      include: {
        article: true,
        sousOfs: true,
        parentOf: true,
        cacheMarge: true,
      },
    });

    if (!of) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    const [dependancesAmont, dependancesAval] = await Promise.all([
      this.prisma.dependance.findMany({
        where: { targetId: id },
      }),
      this.prisma.dependance.findMany({
        where: { sourceId: id },
      }),
    ]);

    return {
      ...of,
      dependances: {
        amont: dependancesAmont,
        aval: dependancesAval,
      },
    };
  }

  @Post()
  @ApiOperation({ summary: 'Creer un ordre de fabrication' })
  async create(@Body() body: OfApi.OfCreateRequest) {
    const of = await this.prisma.ordreFabrication.create({
      data: {
        id: body.id,
        articleId: body.articleId,
        quantite: body.quantite,
        dateDebutPrevue: body.dateDebutPrevue,
        dateFinPrevue: body.dateFinPrevue,
        statut: body.statut ?? 'PLANIFIE',
        priorite: body.priorite ?? 2,
        parentOfId: body.parentOfId ?? null,
        clientNom: body.clientNom ?? null,
        clientRef: body.clientRef ?? null,
        config: body.config ?? undefined,
        notes: body.notes ?? null,
      },
      include: { article: true },
    });

    return of;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour un OF (date, statut, priorite, notes)' })
  async update(@Param('id') id: string, @Body() body: OfApi.OfUpdateRequest) {
    const existing = await this.prisma.ordreFabrication.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    const of = await this.prisma.ordreFabrication.update({
      where: { id },
      data: {
        ...(body.dateDebutPrevue !== undefined && { dateDebutPrevue: body.dateDebutPrevue }),
        ...(body.dateFinPrevue !== undefined && { dateFinPrevue: body.dateFinPrevue }),
        ...(body.statut !== undefined && { statut: body.statut }),
        ...(body.priorite !== undefined && { priorite: body.priorite }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: { article: true },
    });

    return of;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un OF (soft delete: statut ANNULE)' })
  async delete(@Param('id') id: string) {
    const existing = await this.prisma.ordreFabrication.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    await this.prisma.ordreFabrication.update({
      where: { id },
      data: { statut: 'ANNULE' },
    });

    return { message: `OF '${id}' annule` };
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Deplacer un OF et propager les dates (commit)' })
  async move(
    @Param('id') id: string,
    @Body() body: { newDateDebut: string },
  ) {
    const existing = await this.prisma.ordreFabrication.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    // Propager et persister
    const propagation = await this.propagationService.propagateCommit(id, body.newDateDebut);

    // Recalculer le chemin critique apres propagation
    const criticalPath = await this.criticalPathService.recalculate();

    return { propagation, criticalPath };
  }

  @Post(':id/move-preview')
  @ApiOperation({ summary: 'Previsualiser l\'impact du deplacement d\'un OF (sans persister)' })
  async movePreview(
    @Param('id') id: string,
    @Body() body: { newDateDebut: string },
  ) {
    const existing = await this.prisma.ordreFabrication.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    const preview = this.propagationService.propagatePreview(id, body.newDateDebut);
    return { preview };
  }

  @Get(':id/ancestors')
  @ApiOperation({ summary: 'Tous les ancetres dans le DAG (recursif)' })
  async ancestors(@Param('id') id: string) {
    const existing = await this.prisma.ordreFabrication.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    const ancestors: Array<{ id: string; type: string; depth: number }> = [];
    await this.collectAncestors(id, ancestors, new Set(), 1);
    return { data: ancestors };
  }

  @Get(':id/descendants')
  @ApiOperation({ summary: 'Tous les descendants dans le DAG (recursif)' })
  async descendants(@Param('id') id: string) {
    const existing = await this.prisma.ordreFabrication.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ordre de fabrication '${id}' introuvable`);
    }

    const descendants: Array<{ id: string; type: string; depth: number }> = [];
    await this.collectDescendants(id, descendants, new Set(), 1);
    return { data: descendants };
  }

  private async collectAncestors(
    nodeId: string,
    result: Array<{ id: string; type: string; depth: number }>,
    visited: Set<string>,
    depth: number,
  ): Promise<void> {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const deps = await this.prisma.dependance.findMany({
      where: { targetId: nodeId },
    });

    for (const dep of deps) {
      if (!visited.has(dep.sourceId)) {
        result.push({
          id: dep.sourceId,
          type: dep.sourceType,
          depth,
        });
        await this.collectAncestors(dep.sourceId, result, visited, depth + 1);
      }
    }
  }

  private async collectDescendants(
    nodeId: string,
    result: Array<{ id: string; type: string; depth: number }>,
    visited: Set<string>,
    depth: number,
  ): Promise<void> {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const deps = await this.prisma.dependance.findMany({
      where: { sourceId: nodeId },
    });

    for (const dep of deps) {
      if (!visited.has(dep.targetId)) {
        result.push({
          id: dep.targetId,
          type: dep.targetType,
          depth,
        });
        await this.collectDescendants(dep.targetId, result, visited, depth + 1);
      }
    }
  }
}
