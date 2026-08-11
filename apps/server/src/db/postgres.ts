import { Pool, PoolConfig } from "pg";

import { dbQueryDuration, normalizeDbQuery } from "../utils/metrics";

let pool: Pool | undefined;

function instrumentQuery(pgPool: Pool): void {
  const originalQuery = pgPool.query.bind(pgPool) as unknown as (...args: unknown[]) => unknown;

  pgPool.query = ((...args: unknown[]) => {
    const startedAt = process.hrtime.bigint();
    const labels = normalizeDbQuery(args[0]);
    let observed = false;
    const observe = () => {
      if (observed) return;
      observed = true;
      dbQueryDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
    };

    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      args[args.length - 1] = (...callbackArgs: unknown[]) => {
        observe();
        callback(...callbackArgs);
      };
    }

    try {
      const result = originalQuery(...args);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        return (result as PromiseLike<unknown>).then(
          (value) => {
            observe();
            return value;
          },
          (error) => {
            observe();
            throw error;
          }
        );
      }

      if (typeof callback !== "function") observe();
      return result;
    } catch (error) {
      observe();
      throw error;
    }
  }) as Pool["query"];
}

export function getPgPool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
    };

    pool = new Pool(config);
    instrumentQuery(pool);
  }

  return pool;
}

export async function shutdownPg() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
