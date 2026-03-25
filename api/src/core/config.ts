import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGINS: z.string().default('["http://localhost:5173"]'),
  ROOT_PATH_PREFIX: z.string().default('/v1/api'),
  AI_SERVICE_URL: z.string().default('http://localhost:3002'),
});

export type TEnvVariables = z.infer<typeof envSchema>;

export const envVariables = () => {
  const parsed = envSchema.parse(process.env);
  return parsed;
};
