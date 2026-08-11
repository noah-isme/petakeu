import { hostname } from 'node:os';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import { loadEnv } from '../config/env';
import { logger } from '../utils/logger';

const env = loadEnv();

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'petakeu-api',
  [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'petakeu',
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION ?? '0.1.0',
  [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME ?? hostname(),
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.nodeEnv,
});

export const sdk = new NodeSDK({
  resource,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-redis': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-ioredis': {
        enabled: false,
      },
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

let tracingStarted = false;

function isTestEnvironment(): boolean {
  return env.nodeEnv === 'test' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

export function startTracing(): void {
  if (isTestEnvironment() || tracingStarted) return;

  try {
    sdk.start();
    tracingStarted = true;
    logger.info(
      {
        service_name: 'petakeu-api',
        service_version: process.env.APP_VERSION ?? '0.1.0',
        environment: env.nodeEnv,
      },
      '[otel] OpenTelemetry SDK started'
    );
  } catch (err) {
    logger.warn({ err }, '[otel] OpenTelemetry SDK failed to start; continuing without tracing');
  }
}

export async function shutdownTracing(): Promise<void> {
  if (!tracingStarted) return;

  try {
    await sdk.shutdown();
  } catch (err) {
    logger.warn({ err }, '[otel] OpenTelemetry SDK failed to shut down cleanly');
  } finally {
    tracingStarted = false;
  }
}
