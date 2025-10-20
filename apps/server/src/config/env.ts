export interface EnvConfig {
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
}

export function loadEnv(): EnvConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL
  };
}
