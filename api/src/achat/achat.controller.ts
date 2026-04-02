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
import { AchatApi } from './_contract';

@ApiTags('Achat')
@Controller('achat')
export class AchatController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les achats avec pagination et filtres' })
  async list(@Query() query: AchatApi.AchatListRequest) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (query.statut) {
      where.statut = query.statut;
    }
    if (query.typeLien) {
      where.typeLien = query.typeLien;
    }
    if (query.fournisseur) {
      where.fournisseur = { contains: query.fournisseur, mode: 'insensitive' };
    }
    if (query.articleId) {
      where.articleId = query.articleId;
    }

    const [data, total] = await Promise.all([
      this.prisma.achat.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ dateLivraisonPrevue: 'asc' }],
        include: { article: true },
      }),
      this.prisma.achat.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  @Get('fournisseurs-risk')
  @ApiOperation({ summary: 'Analyse de risque par fournisseur' })
  async fournisseursRisk() {
    const achats = await this.prisma.achat.findMany({
      where: { statut: { not: 'ANNULE' } },
      include: { article: true },
    });

    const alerts = await this.prisma.alerte.findMany({
      where: { dismissed: false },
    });

    // Group by fournisseur
    const supplierMap = new Map<
      string,
      {
        totalAchats: number;
        achatsEnRetard: number;
        achatIds: string[];
      }
    >();

    for (const achat of achats) {
      if (!supplierMap.has(achat.fournisseur)) {
        supplierMap.set(achat.fournisseur, {
          totalAchats: 0,
          achatsEnRetard: 0,
          achatIds: [],
        });
      }
      const s = supplierMap.get(achat.fournisseur)!;
      s.totalAchats++;
      s.achatIds.push(achat.id);
      if (achat.statut === 'EN_RETARD') s.achatsEnRetard++;
    }

    // Check penuries from alerts
    const penurieAlerts = alerts.filter((a) => a.type === 'penurie');

    // Build result with dependent OFs (query dependance table)
    const deps = await this.prisma.dependance.findMany({
      where: { sourceType: 'achat' },
    });

    const achatToOfs = new Map<string, string[]>();
    for (const dep of deps) {
      if (!achatToOfs.has(dep.sourceId))
        achatToOfs.set(dep.sourceId, []);
      achatToOfs.get(dep.sourceId)!.push(dep.targetId);
    }

    const suppliers: Array<{
      name: string;
      totalAchats: number;
      achatsEnRetard: number;
      penuriesActives: number;
      dependentOfIds: string[];
      dependentCommandCount: number;
      riskScore: number;
    }> = [];
    for (const [name, data] of supplierMap) {
      const dependentOfIds = new Set<string>();
      for (const achatId of data.achatIds) {
        for (const ofId of achatToOfs.get(achatId) ?? []) {
          dependentOfIds.add(ofId);
        }
      }

      // Count penuries for this supplier's articles
      const penuriesActives = penurieAlerts.filter((a) => {
        const noeuds = a.noeuds as string[];
        return (
          Array.isArray(noeuds) &&
          data.achatIds.some((id) => noeuds.includes(id))
        );
      }).length;

      const riskScore = Math.min(
        100,
        Math.round(
          (data.achatsEnRetard / Math.max(data.totalAchats, 1)) * 60 +
            (penuriesActives > 0 ? 40 : 0),
        ),
      );

      suppliers.push({
        name,
        totalAchats: data.totalAchats,
        achatsEnRetard: data.achatsEnRetard,
        penuriesActives,
        dependentOfIds: [...dependentOfIds],
        dependentCommandCount: 0,
        riskScore,
      });
    }

    suppliers.sort((a, b) => b.riskScore - a.riskScore);
    return { suppliers };
  }

  @Get('alertes')
  @ApiOperation({ summary: 'Achats en anomalie (retard, obsolete, penurie)' })
  async alertes() {
    const enRetard = await this.prisma.achat.findMany({
      where: { statut: 'EN_RETARD' },
      include: { article: true },
    });

    const obsoletes = await this.prisma.achat.findMany({
      where: {
        typeLien: 'specifique',
        ofSpecifique: { statut: 'ANNULE' },
        statut: { not: 'ANNULE' },
      },
      include: { article: true },
    });

    return {
      enRetard,
      obsoletes,
      totalAlertes: enRetard.length + obsoletes.length,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d\'un achat avec allocations' })
  async detail(@Param('id') id: string) {
    const achat = await this.prisma.achat.findUnique({
      where: { id },
      include: {
        article: true,
        ofSpecifique: true,
        cacheAllocations: {
          include: { of: { include: { article: true } } },
          orderBy: { rangPriorite: 'asc' },
        },
      },
    });

    if (!achat) {
      throw new NotFoundException(`Achat '${id}' introuvable`);
    }

    return achat;
  }

  @Post()
  @ApiOperation({ summary: 'Creer un achat' })
  async create(@Body() body: AchatApi.AchatCreateRequest) {
    const achat = await this.prisma.achat.create({
      data: {
        id: body.id,
        articleId: body.articleId,
        quantite: body.quantite,
        dateCommande: body.dateCommande,
        dateLivraisonPrevue: body.dateLivraisonPrevue,
        fournisseur: body.fournisseur,
        statut: body.statut ?? 'COMMANDE',
        typeLien: body.typeLien,
        ofSpecifiqueId: body.ofSpecifiqueId ?? null,
        prixUnitaire: body.prixUnitaire ?? null,
        notes: body.notes ?? null,
      },
      include: { article: true },
    });

    return achat;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un achat (date, statut, quantite)' })
  async update(@Param('id') id: string, @Body() body: AchatApi.AchatUpdateRequest) {
    const existing = await this.prisma.achat.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Achat '${id}' introuvable`);
    }

    const achat = await this.prisma.achat.update({
      where: { id },
      data: {
        ...(body.dateLivraisonPrevue !== undefined && { dateLivraisonPrevue: body.dateLivraisonPrevue }),
        ...(body.dateLivraisonReelle !== undefined && { dateLivraisonReelle: body.dateLivraisonReelle }),
        ...(body.statut !== undefined && { statut: body.statut }),
        ...(body.quantite !== undefined && { quantite: body.quantite }),
        ...(body.quantiteRecue !== undefined && { quantiteRecue: body.quantiteRecue }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: { article: true },
    });

    return achat;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Annuler un achat' })
  async delete(@Param('id') id: string) {
    const existing = await this.prisma.achat.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Achat '${id}' introuvable`);
    }

    await this.prisma.achat.update({
      where: { id },
      data: { statut: 'ANNULE' },
    });

    return { message: `Achat '${id}' annule` };
  }
}
