import { StoreBankCreds } from "../banks";
import { AvailableBanks } from "../domain";
import { get } from "../infra/cacheHelpers";
import { logger } from "./logger";

// Helper: obter credenciais de uma loja
export async function getBankCredsForStore(
  storeId: string
): Promise<StoreBankCreds | null> {
  logger(`-> getBankCredsForStore ${storeId}`);
  const key = `bankCreds:${storeId}`;
  const raw = await get(key);
  return raw ? (JSON.parse(raw) as StoreBankCreds) : null;
}

export async function getCacheAuthToken(
  banco: AvailableBanks,
  storeId: string
): Promise<string> {
  logger(`-> getCacheAuthToken ${storeId}`);
  const key = `${banco}-token:${storeId}`;
  const raw = await get(key);
  if (!raw) throw new Error(`Token ${key} not found!`);
  return raw;
}
