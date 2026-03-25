import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createOfSchema, updateOfSchema } from './_entities';

export namespace OfApi {
  export class OfCreateRequest extends createZodDto(createOfSchema) {}
  export class OfUpdateRequest extends createZodDto(updateOfSchema) {}

  export const listRequestSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
    statut: z.string().optional(),
    priorite: z.coerce.number().int().optional(),
    client: z.string().optional(),
    dateDebut: z.string().optional(),
    dateFin: z.string().optional(),
  });

  export class OfListRequest extends createZodDto(listRequestSchema) {}
}
