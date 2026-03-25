import { RedisClient } from "bun";
import { ee } from "./events";

const WS_CHANNEL = "ws-events";

let pubClient: RedisClient | null = null;
let subClient: RedisClient | null = null;
let bridgeActive = false;

/**
 * Initialize Redis pub/sub bridge for cross-replica WebSocket events.
 * Events published via `publishEvent()` are broadcast to all replicas
 * and re-emitted on the local `ee` EventEmitter.
 *
 * Without Redis (local dev), falls back to direct `ee.emit()`.
 */
export function initWsRedisBridge() {
  if (!process.env.REDIS_URL) {
    console.log("[ws-bridge] No REDIS_URL — using local EventEmitter only");
    return;
  }

  try {
    pubClient = new RedisClient(process.env.REDIS_URL);
    subClient = new RedisClient(process.env.REDIS_URL);

    subClient.subscribe(WS_CHANNEL, (message) => {
      try {
        const { event, data } = JSON.parse(message) as { event: string; data: unknown };
        ee.emit(event, data);
      } catch (err) {
        console.error("[ws-bridge] Failed to parse message:", err);
      }
    });

    bridgeActive = true;
    console.log("[ws-bridge] Redis pub/sub bridge active");
  } catch (err) {
    console.error("[ws-bridge] Failed to init Redis bridge, falling back to local:", err);
  }
}

/**
 * Publish a WebSocket event. If Redis bridge is active, publishes to Redis
 * (all replicas receive it). Otherwise emits directly on local EventEmitter.
 */
export function publishEvent(event: string, data: unknown) {
  if (bridgeActive && pubClient) {
    pubClient.publish(WS_CHANNEL, JSON.stringify({ event, data }));
  } else {
    ee.emit(event, data);
  }
}
