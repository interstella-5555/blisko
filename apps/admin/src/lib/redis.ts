import { RedisClient } from "bun";

let _redis: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!_redis) {
    _redis = new RedisClient(process.env.REDIS_URL!);
  }
  return _redis;
}
