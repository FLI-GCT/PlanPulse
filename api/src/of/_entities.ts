import { z } from 'zod';

export const statutOfEnum = z.enum([
  'PLANIFIE',
  'EN_COURS',
  'TERMINE',
  'EN_RETARD',
  'ANNULE',
]);

export const ofSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  quantite: z.number().int(),
  dateDebutPrevue: z.string(),
  dateFinPrevue: z.string(),
  statut: statutOfEnum,
  priorite: z.number().int(),
  parentOfId: z.string().nullable(),
  clientNom: z.string().nullable(),
  clientRef: z.string().nullable(),
  config: z.any().nullable(),
  notes: z.string().nullable(),
});

export const createOfSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  quantite: z.number().int().positive(),
  dateDebutPrevue: z.string(),
  dateFinPrevue: z.string(),
  statut: statutOfEnum.optional().default('PLANIFIE'),
  priorite: z.number().int().min(1).max(5).optional().default(2),
  parentOfId: z.string().nullable().optional().default(null),
  clientNom: z.string().nullable().optional().default(null),
  clientRef: z.string().nullable().optional().default(null),
  config: z.any().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
});

export const updateOfSchema = z.object({
  dateDebutPrevue: z.string().optional(),
  dateFinPrevue: z.string().optional(),
  statut: statutOfEnum.optional(),
  priorite: z.number().int().min(1).max(5).optional(),
  notes: z.string().nullable().optional(),
});

export type Of = z.infer<typeof ofSchema>;
export type CreateOf = z.infer<typeof createOfSchema>;
export type UpdateOf = z.infer<typeof updateOfSchema>;
