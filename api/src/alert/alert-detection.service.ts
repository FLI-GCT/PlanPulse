import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { WsGateway } from 'src/ws/ws.gateway';
import { Severite } from '../../prisma/generated/client';

interface DetectedAlert {
  type: string;
  severite: Severite;
  message: string;
  noeuds: string[];
}

@Injectable()
export class AlertDetectionService {
  private readonly logger = new Logger(AlertDetectionService.name);
  private isRunning = false;
  private lastRunAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async detectAll(): Promise<void> {
    if (this.isRunning) return;
    if (Date.now() - this.lastRunAt < 10_000) return; // debounce 10s
    this.isRunning = true;
    this.lastRunAt = Date.now();

    try {
      this.logger.debug('Lancement de la detection des alertes...');

      const detected: DetectedAlert[] = [];

      const [achatRetard, penuries, contraintes, orphelins, obsoletes] =
        await Promise.all([
          this.detectAchatRetard(),
          this.detectPenurie(),
          this.detectContrainteViolee(),
          this.detectOfOrphelin(),
          this.detectAchatObsolete(),
        ]);

      detected.push(...achatRetard, ...penuries, ...contraintes, ...orphelins, ...obsoletes);

      await this.reconcile(detected);

      this.logger.debug(`Detection terminee: ${detected.length} alerte(s) detectee(s)`);
    } finally {
      this.isRunning = false;
    }
  }

  // ─── Detection: Achats en retard ────────────────────────

  private async detectAchatRetard(): Promise<DetectedAlert[]> {
    const now = new Date();

    const achats = await this.prisma.achat.findMany({
      where: {
        OR: [
          { statut: 'EN_RETARD' },
          {
            dateLivraisonPrevue: { lt: now },
            statut: { notIn: ['RECEPTIONNE', 'ANNULE'] },
          },
        ],
      },
      select: { id: true, fournisseur: true },
    });

    return achats.map((a) => ({
      type: 'achat_retard',
      severite: Severite.WARNING,
      message: `Achat ${a.id} (${a.fournisseur}) en retard de livraison`,
      noeuds: [a.id],
    }));
  }

  // ─── Detection: Penuries ────────────────────────────────

  private async detectPenurie(): Promise<DetectedAlert[]> {
    const alerts: DetectedAlert[] = [];

    // Articles achetes communs avec leurs achats et demande via nomenclature
    const articles = await this.prisma.article.findMany({
      where: { type: 'ACHETE_COMMUN' },
      select: {
        id: true,
        label: true,
        achats: {
          where: { statut: { not: 'ANNULE' } },
          select: { quantite: true },
        },
        nomenclaturesEnfant: {
          select: {
            quantite: true,
            parent: {
              select: {
                ordresFabrication: {
                  where: { statut: { notIn: ['ANNULE', 'TERMINE'] } },
                  select: { quantite: true },
                },
              },
            },
          },
        },
      },
    });

    for (const article of articles) {
      const totalAchete = article.achats.reduce((sum, a) => sum + a.quantite, 0);

      let totalDemande = 0;
      for (const nom of article.nomenclaturesEnfant) {
        for (const of_ of nom.parent.ordresFabrication) {
          totalDemande += nom.quantite * of_.quantite;
        }
      }

      const deficit = totalDemande - totalAchete;
      if (deficit > 0) {
        alerts.push({
          type: 'penurie',
          severite: Severite.CRITICAL,
          message: `Penurie potentielle sur ${article.label}: ${deficit} unites manquantes`,
          noeuds: [article.id],
        });
      }
    }

    return alerts;
  }

  // ─── Detection: Contraintes temporelles violees ─────────

  private async detectContrainteViolee(): Promise<DetectedAlert[]> {
    const alerts: DetectedAlert[] = [];

    // Get all OF-to-OF dependencies
    const deps = await this.prisma.dependance.findMany({
      where: {
        sourceType: 'of',
        targetType: 'of',
      },
      select: {
        sourceId: true,
        targetId: true,
        delaiMinimum: true,
      },
    });

    if (deps.length === 0) return alerts;

    // Collect all OF IDs involved
    const ofIds = [...new Set(deps.flatMap((d) => [d.sourceId, d.targetId]))];

    const ofs = await this.prisma.ordreFabrication.findMany({
      where: {
        id: { in: ofIds },
        statut: { notIn: ['ANNULE', 'TERMINE'] },
      },
      select: { id: true, dateDebutPrevue: true, dateFinPrevue: true },
    });

    const ofMap = new Map(ofs.map((o) => [o.id, o]));

    // In the DAG: sourceId is predecessor, targetId is successor
    // (source must finish before target can start)
    for (const dep of deps) {
      const predecessor = ofMap.get(dep.sourceId);
      const successor = ofMap.get(dep.targetId);

      if (!predecessor || !successor) continue;

      const delaiMs = dep.delaiMinimum * 24 * 60 * 60 * 1000;
      const earliestStart = new Date(predecessor.dateFinPrevue.getTime() + delaiMs);

      if (successor.dateDebutPrevue < earliestStart) {
        alerts.push({
          type: 'contrainte_violee',
          severite: Severite.WARNING,
          message: `Contrainte temporelle violee: ${successor.id} commence avant la fin de ${predecessor.id}`,
          noeuds: [predecessor.id, successor.id],
        });
      }
    }

    return alerts;
  }

  // ─── Detection: OFs orphelins ───────────────────────────

  private async detectOfOrphelin(): Promise<DetectedAlert[]> {
    const orphelins = await this.prisma.ordreFabrication.findMany({
      where: {
        parentOfId: { not: null },
        parentOf: { statut: 'ANNULE' },
        statut: { not: 'ANNULE' },
      },
      select: { id: true, parentOfId: true },
    });

    return orphelins.map((o) => ({
      type: 'of_orphelin',
      severite: Severite.INFO,
      message: `OF orphelin ${o.id}: son parent ${o.parentOfId} est annule`,
      noeuds: [o.id, o.parentOfId!],
    }));
  }

  // ─── Detection: Achats obsoletes ────────────────────────

  private async detectAchatObsolete(): Promise<DetectedAlert[]> {
    const obsoletes = await this.prisma.achat.findMany({
      where: {
        typeLien: 'specifique',
        ofSpecifique: { statut: 'ANNULE' },
        statut: { not: 'ANNULE' },
      },
      select: { id: true, ofSpecifiqueId: true },
    });

    return obsoletes.map((a) => ({
      type: 'achat_obsolete',
      severite: Severite.INFO,
      message: `Achat obsolete ${a.id}: l'OF ${a.ofSpecifiqueId} est annule`,
      noeuds: [a.id, a.ofSpecifiqueId!],
    }));
  }

  // ─── Reconciliation: creer/resoudre les alertes ─────────

  private async reconcile(detected: DetectedAlert[]): Promise<void> {
    // Load all active (non-dismissed) alerts
    const existing = await this.prisma.alerte.findMany({
      where: { dismissed: false },
    });

    // Build a key for matching: type + sorted noeuds
    const makeKey = (type: string, noeuds: string[]) =>
      `${type}::${[...noeuds].sort().join(',')}`;

    const detectedKeys = new Set(
      detected.map((d) => makeKey(d.type, d.noeuds)),
    );

    const existingKeys = new Map(
      existing.map((e) => [makeKey(e.type, e.noeuds as string[]), e]),
    );

    // Create new alerts for detected issues not already tracked
    for (const d of detected) {
      const key = makeKey(d.type, d.noeuds);
      if (!existingKeys.has(key)) {
        const created = await this.prisma.alerte.create({
          data: {
            type: d.type,
            severite: d.severite,
            message: d.message,
            noeuds: d.noeuds,
          },
        });
        this.wsGateway.emitAlertNew(created);
        this.logger.log(`Nouvelle alerte: [${d.severite}] ${d.message}`);
      }
    }

    // Auto-resolve alerts that are no longer detected
    for (const [key, alert] of existingKeys) {
      if (!detectedKeys.has(key)) {
        await this.prisma.alerte.update({
          where: { id: alert.id },
          data: { dismissed: true },
        });
        this.wsGateway.emitAlertResolved(alert.id);
        this.logger.log(`Alerte resolue: [${alert.type}] ${alert.message}`);
      }
    }
  }
}
