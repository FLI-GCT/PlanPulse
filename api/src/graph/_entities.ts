import { z } from 'zod';

export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['of', 'achat']),
  label: z.string(),
  articleId: z.string().nullable(),
  dateDebut: z.string(), // ISO date string
  dateFin: z.string(),
  statut: z.string(),
  priorite: z.number().nullable(),
  quantite: z.number(),
  fournisseur: z.string().nullable().optional(),
  version: z.number().default(0), // verrou optimiste
});

export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  sourceId: z.string(),
  sourceType: z.string(),
  targetId: z.string(),
  targetType: z.string(),
  typeLien: z.string(),
  quantite: z.number().nullable(),
  delaiMinimum: z.number(),
});

export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export interface PropagationResult {
  nodeId: string;
  oldDateDebut: string;
  newDateDebut: string;
  oldDateFin: string;
  newDateFin: string;
  deltaJours: number;
}

export interface MarginResult {
  nodeId: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  floatTotal: number;
  floatLibre: number;
  estCritique: boolean;
}

export interface CriticalPathResult {
  criticalNodes: string[];
  margins: MarginResult[];
}
