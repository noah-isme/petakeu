import {
  parseScheduledReportConfig,
  ScheduledReportConfig,
} from '../types/scheduled-report';

export interface EnvConfig {
  port: number;
  nodeEnv: string;
  databaseUrl?: string;
  redisUrl?: string;
  authSecret?: string;
  authDisabled: boolean;
  storageEndpoint: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storageRegion: string;
  storageBucket: string;
  storageReportsBucket: string;
  choroplethCacheTtl: number;
  regionSummaryCacheTtl: number;
  scheduledReports: ScheduledReportConfig;
}

export function loadEnv(): EnvConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    authSecret: process.env.AUTH_SECRET,
    authDisabled: process.env.AUTH_DISABLED === 'true' || !process.env.AUTH_SECRET,
    storageEndpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
    storageAccessKey: process.env.STORAGE_ACCESS_KEY ?? 'admin',
    storageSecretKey: process.env.STORAGE_SECRET_KEY ?? 'password123',
    storageRegion: process.env.STORAGE_REGION ?? 'us-east-1',
    storageBucket: process.env.STORAGE_BUCKET ?? 'uploads',
    storageReportsBucket: process.env.STORAGE_REPORTS_BUCKET ?? 'reports',
    choroplethCacheTtl: Number(process.env.CHOROPLETH_CACHE_TTL ?? 300),
    regionSummaryCacheTtl: Number(process.env.REGION_SUMMARY_CACHE_TTL ?? 180),
    scheduledReports: parseScheduledReportConfig(),
  };
}
