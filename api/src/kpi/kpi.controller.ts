import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';

@ApiTags('KPI')
@Controller('kpi')
export class KpiController {
  constructor(private readonly prisma: PrismaService) {}

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
