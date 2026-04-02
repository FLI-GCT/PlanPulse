import { z } from 'zod';

export const scenarioActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('shift_supplier'),
    fournisseur: z.string(),
    deltaJours: z.number(),
  }),
  z.object({
    type: z.literal('cancel_command'),
    rootOfId: z.string(),
  }),
  z.object({
    type: z.literal('reduce_cadence'),
    articleId: z.string(),
    factorPct: z.number(),
  }),
  z.object({
    type: z.literal('shift_of'),
    ofId: z.string(),
    deltaJours: z.number(),
  }),
]);

export type ScenarioAction = z.infer<typeof scenarioActionSchema>;

export interface ScenarioSnapshot {
  nodes: Array<{
    id: string;
    type: string;
    dateDebut: string;
    dateFin: string;
    statut: string;
    [key: string]: unknown;
  }>;
  edges: Array<{
    sourceId: string;
    targetId: string;
    typeLien: string;
    delaiMinimum: number;
    [key: string]: unknown;
  }>;
  margins: Array<{
    nodeId: string;
    floatTotal: number;
    estCritique: boolean;
    [key: string]: unknown;
  }>;
  capturedAt: string;
}

export interface ScenarioKpi {
  activeOfs: number;
  lateOfs: number;
  tensionPct: number;
  coveragePct: number;
  computedAt: string;
}
