import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getPgPool } from './postgres';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

const MIGRATION_FILES = [
  '001_init.sql',
  '002_uploads_reports.sql',
  '003_gamification.sql',
  '004_audit_logs.sql',
];

export async function runMigrations(): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of MIGRATION_FILES) {
      const { rows } = await client.query(
        'SELECT name FROM _migrations WHERE name = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] Skipping already-applied: ${file}`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, 'utf8');

      console.log(`[migrate] Applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations(name) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] Applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed for ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    client.release();
  }
}
