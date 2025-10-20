import { Pool, PoolConfig } from "pg";

let pool: Pool | undefined;

export function getPgPool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
    };

    pool = new Pool(config);
  }

  return pool;
}

export async function shutdownPg() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
