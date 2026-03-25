import { z } from 'zod';

export const statutAchatEnum = z.enum([
  'COMMANDE',
  'EN_TRANSIT',
  'RECEPTIONNE',
  'EN_RETARD',
  'ANNULE',
]);

export const achatSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  quantite: z.number().int(),
  quantiteRecue: z.number().int(),
  dateCommande: z.string(),
  dateLivraisonPrevue: z.string(),
  dateLivraisonReelle: z.string().nullable(),
  fournisseur: z.string(),
  statut: statutAchatEnum,
  typeLien: z.string(),
  ofSpecifiqueId: z.string().nullable(),
  prixUnitaire: z.number().nullable(),
  notes: z.string().nullable(),
});

export const createAchatSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  quantite: z.number().int().positive(),
  dateCommande: z.string(),
  dateLivraisonPrevue: z.string(),
  fournisseur: z.string(),
  statut: statutAchatEnum.optional().default('COMMANDE'),
  typeLien: z.enum(['partage', 'specifique']),
  ofSpecifiqueId: z.string().nullable().optional().default(null),
  prixUnitaire: z.number().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
});

export const updateAchatSchema = z.object({
  dateLivraisonPrevue: z.string().optional(),
  dateLivraisonReelle: z.string().nullable().optional(),
  statut: statutAchatEnum.optional(),
  quantite: z.number().int().positive().optional(),
  quantiteRecue: z.number().int().optional(),
  notes: z.string().nullable().optional(),
});

export type Achat = z.infer<typeof achatSchema>;
export type CreateAchat = z.infer<typeof createAchatSchema>;
export type UpdateAchat = z.infer<typeof updateAchatSchema>;
