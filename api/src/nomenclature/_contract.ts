import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nomenclatureSchema, createNomenclatureSchema } from './_entities';

export namespace NomenclatureApi {
  // --- Responses ---

  export class NomenclatureDto extends createZodDto(nomenclatureSchema) {}

  export class ListResponse extends createZodDto(
    z.object({
      data: z.array(nomenclatureSchema),
    }),
  ) {}

  export const explodedNodeSchema = z.object({
    id: z.number(),
    parentArticleId: z.string(),
    composantArticleId: z.string(),
    quantite: z.number(),
    optionnel: z.boolean(),
    groupeOption: z.string().nullable(),
    version: z.string(),
    niveau: z.number(),
    quantiteCumulee: z.number(),
  });

  export class ExplodedResponse extends createZodDto(
    z.object({
      data: z.array(explodedNodeSchema),
    }),
  ) {}

  // --- Requests ---

  export class CreateRequest extends createZodDto(createNomenclatureSchema) {}
}
