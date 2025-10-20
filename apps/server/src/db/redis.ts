import { createClient, RedisClientType } from "redis";

let client: RedisClientType | undefined;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379"
    });

    client.on("error", (err) => {
      console.error("[petakeu] Redis error", err);
    });

    await client.connect();
  }

  return client;
}

export async function shutdownRedis() {
  if (client) {
    await client.disconnect();
    client = undefined;
  }
}
