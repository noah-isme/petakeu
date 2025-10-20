import dotenv from "dotenv";
import http from "node:http";

import { loadEnv } from "./config/env";
import { createApp } from "./server";

dotenv.config();

async function bootstrap() {
  const app = await createApp();
  const env = loadEnv();

  const server = http.createServer(app);

  server.listen(env.port, () => {
    console.log(`[petakeu] API listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("[petakeu] Failed to start server", error);
  process.exit(1);
});
