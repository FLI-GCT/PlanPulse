import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { AlertDetectionService } from './alert-detection.service';

@ApiTags('Alert')
@Controller('alert')
export class AlertController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertDetection: AlertDetectionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les alertes actives' })
  async list() {
    const alerts = await this.prisma.alerte.findMany({
      where: { dismissed: false },
      orderBy: [
        { severite: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return alerts;
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resume des alertes actives par severite' })
  async summary() {
    const alerts = await this.prisma.alerte.findMany({
      where: { dismissed: false },
      select: { severite: true },
    });

    const counts = { info: 0, warning: 0, critical: 0, total: 0 };

    for (const alert of alerts) {
      counts.total++;
      switch (alert.severite) {
        case 'INFO':
          counts.info++;
          break;
        case 'WARNING':
          counts.warning++;
          break;
        case 'CRITICAL':
          counts.critical++;
          break;
      }
    }

    return counts;
  }

  @Patch(':id/dismiss')
  @ApiOperation({ summary: 'Marquer une alerte comme traitee' })
  async dismiss(@Param('id', ParseIntPipe) id: number) {
    const alert = await this.prisma.alerte.findUnique({ where: { id } });

    if (!alert) {
      throw new NotFoundException(`Alerte '${id}' introuvable`);
    }

    const updated = await this.prisma.alerte.update({
      where: { id },
      data: { dismissed: true },
    });

    return updated;
  }

  @Get('detect')
  @ApiOperation({ summary: 'Declencher manuellement la detection des alertes' })
  async triggerDetection() {
    await this.alertDetection.detectAll();
    return { message: 'Detection des alertes terminee' };
  }
}
