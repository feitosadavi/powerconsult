import Redis from "ioredis";
// import { env } from "./env";

export const redis = new Redis(process.env.REDIS_URL || "", {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (e) => console.error("[redis:error]", e));
redis.on("connect", () => console.log("[redis] connected"));
