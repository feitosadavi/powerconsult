import { redis } from "./redis";
import { logger } from "../lib/logger";
import { ITAU_ENDPOINTS } from "../constants";

export async function get(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (e) {
    logger(`[cache] get error key=${key} err=${String(e)}`);
    return null;
  }
}

export async function set(key: string, value: string, ttlSeconds?: number) {
  try {
    if (typeof ttlSeconds === "number" && ttlSeconds > 0) {
      // ioredis supports EX
      await redis.set(key, value, "EX", ttlSeconds);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (e) {
    logger(`[cache] set error key=${key} err=${String(e)}`);
    return false;
  }
}

export async function del(key: string) {
  try {
    await redis.del(key);
    return true;
  } catch (e) {
    logger(`[cache] del error key=${key} err=${String(e)}`);
    return false;
  }
}

export async function getJson<T = unknown>(key: string): Promise<T | null> {
  try {
    const raw = await get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    logger(`[cache] getJson error key=${key} err=${String(e)}`);
    return null;
  }
}

export async function setJson(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> {
  try {
    const raw = JSON.stringify(value);
    return await set(key, raw, ttlSeconds);
  } catch (e) {
    logger(`[cache] setJson error key=${key} err=${String(e)}`);
    return false;
  }
}

export async function incr(key: string) {
  try {
    return await redis.incr(key);
  } catch (e) {
    logger(`[cache] incr error key=${key} err=${String(e)}`);
    return null;
  }
}

export async function expire(key: string, seconds: number) {
  try {
    return await redis.expire(key, seconds);
  } catch (e) {
    logger(`[cache] expire error key=${key} err=${String(e)}`);
    return 0;
  }
}

type Endpoint = { method: string; rel: string; href: string };

export async function getEndpointFromCache(rel: string): Promise<Endpoint> {
  const endpoints = await getJson<Endpoint[]>(ITAU_ENDPOINTS);
  if (!endpoints) {
    throw new Error(`No endpoints cached under ${ITAU_ENDPOINTS}`);
  }

  const endpoint = endpoints.find((ep) => String(ep?.rel) === String(rel));
  if (!endpoint) throw new Error(`Endpoint not found for rel: ${rel}`);
  return endpoint;
}

