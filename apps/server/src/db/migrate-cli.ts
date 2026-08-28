import "dotenv/config";

import { runMigrations } from "./migrate";
import { shutdownPg } from "./postgres";

async function main(): Promise<void> {
  try {
    await runMigrations();
  } finally {
    await shutdownPg();
  }
}

main().catch((error: unknown) => {
  console.error("[migrate] Migration command failed", error);
  process.exitCode = 1;
});
