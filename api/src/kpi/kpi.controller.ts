import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';

@ApiTags('KPI')
@Controller('kpi')
export class KpiController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('trend')
  @ApiOperation({ summary: 'Tendance KPI sur N jours glissants' })
  async trend(@Query('days') daysParam?: string) {
    const days = Number(daysParam) || 7;

    // Get current values
    const [ofActifs, ofEnRetard, totalOfs, achatsTotal, achatsCouverts] =
      await Promise.all([
        this.prisma.ordreFabrication.count({
          where: { statut: { in: ['PLANIFIE', 'EN_COURS'] } },
        }),
        this.prisma.ordreFabrication.count({
          where: { statut: 'EN_RETARD' },
        }),
        this.prisma.ordreFabrication.count({
          where: { statut: { not: 'ANNULE' } },
        }),
        this.prisma.achat.count({
          where: { statut: { not: 'ANNULE' } },
        }),
        this.prisma.achat.count({
          where: { statut: { in: ['RECEPTIONNE', 'EN_TRANSIT', 'COMMANDE'] } },
        }),
      ]);

    const cacheCritiques = await this.prisma.cacheMarge.count({
      where: { estCritique: true },
    });
    const tension =
      totalOfs > 0
        ? Math.round(((ofEnRetard + cacheCritiques) / totalOfs) * 100)
        : 0;
    const couverture =
      achatsTotal > 0
        ? Math.round((achatsCouverts / achatsTotal) * 100)
        : 100;

    // For v1: repeat current values N times (no historical data yet)
    return {
      activeOfs: Array(days).fill(ofActifs),
      lateOfs: Array(days).fill(ofEnRetard),
      tensionPct: Array(days).fill(tension),
      coveragePct: Array(days).fill(couverture),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Indicateurs cles du plan de production' })
  async summary() {
    const [ofActifs, ofEnRetard, totalOfs, alertesActives, achatsTotal, achatsCouverts] =
      await Promise.all([
        this.prisma.ordreFabrication.count({
          where: { statut: { in: ['PLANIFIE', 'EN_COURS'] } },
        }),
        this.prisma.ordreFabrication.count({
          where: { statut: 'EN_RETARD' },
        }),
        this.prisma.ordreFabrication.count({
          where: { statut: { not: 'ANNULE' } },
        }),
        this.prisma.alerte.count({
          where: { dismissed: false },
        }),
        this.prisma.achat.count({
          where: { statut: { not: 'ANNULE' } },
        }),
        this.prisma.achat.count({
          where: { statut: { in: ['RECEPTIONNE', 'EN_TRANSIT', 'COMMANDE'] } },
        }),
      ]);

    // Calcul du % tension : ratio OF en retard ou critiques
    const cacheCritiques = await this.prisma.cacheMarge.count({
      where: { estCritique: true },
    });

    const tension = totalOfs > 0
      ? Math.round(((ofEnRetard + cacheCritiques) / totalOfs) * 100)
      : 0;

    // Couverture achats : % achats non annules par rapport au total
    const couvertureAchats = achatsTotal > 0
      ? Math.round((achatsCouverts / achatsTotal) * 100)
      : 100;

    return {
      ofActifs,
      ofEnRetard,
      tension,
      couvertureAchats,
      alertesActives,
      totalOfs,
    };
  }
}
