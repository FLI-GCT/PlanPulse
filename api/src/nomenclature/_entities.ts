import { z } from 'zod';

export const nomenclatureSchema = z.object({
  id: z.number(),
  parentArticleId: z.string(),
  composantArticleId: z.string(),
  quantite: z.number(),
  optionnel: z.boolean(),
  groupeOption: z.string().nullable(),
  version: z.string(),
});

export const createNomenclatureSchema = z.object({
  parentArticleId: z.string(),
  composantArticleId: z.string(),
  quantite: z.number().positive(),
  optionnel: z.boolean().optional().default(false),
  groupeOption: z.string().nullable().optional().default(null),
  version: z.string().optional().default('v1'),
});

export type Nomenclature = z.infer<typeof nomenclatureSchema>;
export type CreateNomenclature = z.infer<typeof createNomenclatureSchema>;
