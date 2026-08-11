import pino from 'pino';

import { loadEnv } from '../config/env';
import { getRequestLogContext } from '../middleware/request-context';

const env = loadEnv();

const isDev = env.nodeEnv !== 'production';

let transportConfig: pino.LoggerOptions['transport'];
if (isDev) {
  try {
    require.resolve('pino-pretty');
    transportConfig = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    };
  } catch {
    // Fall back to standard JSON logger if pino-pretty cannot be resolved
    transportConfig = undefined;
  }
}

export const logger = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  transport: transportConfig,
  mixin: () => getRequestLogContext(),
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  base: {
    service: 'petakeu-api',
    env: env.nodeEnv
  }
});

export const childLogger = (bindings: Record<string, unknown>) => logger.child(bindings);
