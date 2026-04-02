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
import { GraphService } from 'src/graph/services/graph.service';
import { AlertDetectionService } from './alert-detection.service';

@ApiTags('Alert')
@Controller('alert')
export class AlertController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertDetection: AlertDetectionService,
    private readonly graphService: GraphService,
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

  @Get('root-causes')
  @ApiOperation({ summary: 'Causes racines des alertes groupees par impact' })
  async rootCauses() {
    const alerts = await this.prisma.alerte.findMany({
      where: { dismissed: false },
    });

    // Group by (type + main entity)
    const groupMap = new Map<
      string,
      {
        type: string;
        label: string;
        relatedEntityId: string;
        relatedEntityType: string;
        alertIds: number[];
        severity: string;
      }
    >();

    for (const alert of alerts) {
      const noeuds = (alert.noeuds ?? []) as string[];
      const mainEntity = noeuds[0] ?? 'unknown';
      const groupKey = `${alert.type}:${mainEntity}`;

      if (!groupMap.has(groupKey)) {
        let label = alert.message;
        let relatedEntityType = 'of';
        if (
          alert.type === 'achat_retard' ||
          alert.type === 'achat_obsolete'
        ) {
          relatedEntityType = 'achat';
          label = alert.message.split(' en retard')[0] ?? alert.message;
        } else if (alert.type === 'penurie') {
          relatedEntityType = 'achat';
        }

        groupMap.set(groupKey, {
          type: alert.type,
          label: label.substring(0, 80),
          relatedEntityId: mainEntity,
          relatedEntityType,
          alertIds: [],
          severity: alert.severite,
        });
      }

      groupMap.get(groupKey)!.alertIds.push(alert.id);
    }

    // Enrich each group with impact data
    const groups: {
      id: string;
      type: string;
      label: string;
      relatedEntityId: string;
      relatedEntityType: string;
      alertCount: number;
      affectedOfIds: string[];
      affectedCommandCount: number;
      severity: string;
    }[] = [];
    for (const [id, group] of groupMap) {
      let affectedOfIds: string[] = [];
      try {
        const descendants = this.graphService.getSubgraph(
          group.relatedEntityId,
        );
        affectedOfIds = descendants.filter((nodeId) => {
          const node = this.graphService.getNode(nodeId);
          return node && node.type === 'of';
        });
      } catch {
        // Node might not exist in graph
      }

      const rootOfIds = new Set<string>();
      for (const ofId of affectedOfIds) {
        const rootId = this.graphService.findRootOfId(ofId);
        rootOfIds.add(rootId);
      }

      groups.push({
        id,
        type: group.type,
        label: group.label,
        relatedEntityId: group.relatedEntityId,
        relatedEntityType: group.relatedEntityType,
        alertCount: group.alertIds.length,
        affectedOfIds,
        affectedCommandCount: rootOfIds.size,
        severity:
          group.severity === 'CRITICAL'
            ? 'critical'
            : group.severity === 'WARNING'
              ? 'warning'
              : 'info',
      });
    }

    // Sort by severity then impact
    const severityOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    groups.sort((a, b) => {
      const sevDiff =
        (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
      if (sevDiff !== 0) return sevDiff;
      return b.affectedOfIds.length - a.affectedOfIds.length;
    });

    return { groups: groups.slice(0, 20) };
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
