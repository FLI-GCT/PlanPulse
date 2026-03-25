import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createAchatSchema, updateAchatSchema } from './_entities';

export namespace AchatApi {
  export class AchatCreateRequest extends createZodDto(createAchatSchema) {}
  export class AchatUpdateRequest extends createZodDto(updateAchatSchema) {}

  export const listRequestSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
    statut: z.string().optional(),
    typeLien: z.string().optional(),
    fournisseur: z.string().optional(),
    articleId: z.string().optional(),
  });

  export class AchatListRequest extends createZodDto(listRequestSchema) {}
}
