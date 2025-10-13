import { BrowserContext, Page } from "playwright";
import { BANKS, ServiceName } from "../banks";
import { getBankCredsForStore, getCacheAuthToken, logger } from "../lib";
import { AvailableBanks } from "../domain";
import { getAccessToken } from "../services/itau/getAccessToken";

type BankServiceFn = (args: {
  page: Page;
  user: { userId: string; storeId: string };
  bankCreds?: { username: string; password: string };
  // ... outros campos do seu input:
  [k: string]: unknown;
}) => Promise<any>;

type BanksMap = {
  [bankName: string]: {
    services: Record<string, BankServiceFn>;
  };
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
    ),
  ]) as Promise<T>;
}

type Service = {
  name: ServiceName;
  input: any;
};

const SESSION_STORAGE_KEYS: Record<AvailableBanks, string> = {
  itau: "token",
  bancopan: "token",
  bradesco: "token",
};

async function runBankTask(
  banco: AvailableBanks,
  {
    service,
    browserContext,
    bankCredsMap,
    user,
    taskTimeoutMs = 60_000,
  }: {
    service: Service;
    browserContext: BrowserContext;
    bankCredsMap: Record<string, { username: string; password: string }> | null;
    user: { userId: string; storeId: string };
    taskTimeoutMs?: number;
  }
) {
  if (!BANKS[banco] || !BANKS[banco].services?.[service.name]) {
    return {
      [banco]: {
        error: `service '${service.name}' not available for ${banco}`,
      },
    };
  }

  let page: Page | null = null;

  try {
    logger(`-> Starting [${service.name}] for ${banco}`, user);
    page = await browserContext.newPage();

    const token = await getCacheAuthToken(banco, user.storeId);
    logger(`-> Adding sessionToken`, user);
    // Injeta token de sessão ANTES de qualquer script da página
    await page.addInitScript(
      (cfg: { key: string; value: string }) => {
        try {
          sessionStorage.setItem(cfg.key, cfg.value);
          sessionStorage.setItem("valid_token", "true");
        } catch {}
      },
      {
        key: SESSION_STORAGE_KEYS[banco],
        value: token,
      }
    );

    // Chama o serviço do banco com timeout e page isolada
    const output = await BANKS[banco].services[service.name]({
      ...service.input,
      bankCreds: bankCredsMap?.[banco], // pega credenciais corretas do banco
      page,
      user,
    });

    return output;
  } catch (error: any) {
    const msg =
      error?.message === "Timeout" || String(error).includes("Timeout")
        ? `O serviço do ${banco} está offline`
        : String(error?.message || error);
    return { [banco]: { error: msg } };
  } finally {
    try {
      await page?.close();
    } catch {}
  }
}

type BankTaskOutput = { [bank: string]: string[] };

export async function getVehicleOptionsController({
  user,
  bancos,
  service,
  browserContext,
  taskTimeoutMs = 60_000,
}: {
  user: { userId: string; storeId: string };
  bancos: AvailableBanks[];
  service: { name: ServiceName; input: any }; // "isAvailableForFpinancing"
  browserContext: BrowserContext;
  taskTimeoutMs?: number;
}) {
  logger(`-> Getting getVehicleOptionsController`, user);

  const bankCreds = await getBankCredsForStore(user.storeId);

  const results = await Promise.allSettled<BankTaskOutput>(
    bancos.map((banco) =>
      runBankTask(banco, {
        service,
        browserContext,
        bankCredsMap: bankCreds,
        user,
        taskTimeoutMs,
      })
    )
  );

  const fulfilledRes = results.filter(
    (item): item is PromiseFulfilledResult<{ [bank: string]: string[] }> =>
      item.status === "fulfilled"
  );
  console.log({ fulfilledRes });

  if (!fulfilledRes.length) return results;

  // Mapa temporário: veículo → set de bancos
  const vehicleMap: Record<string, Set<string>> = {};

  // Itera por todos os resultados fulfilled
  for (const item of fulfilledRes) {
    const bankName = Object.keys(item.value)[0];
    const vehicles = item.value[bankName];

    for (const vehicle of vehicles) {
      if (!vehicleMap[vehicle]) vehicleMap[vehicle] = new Set();
      vehicleMap[vehicle].add(bankName);
    }
  }

  // Constrói o array final
  const finalResult = Object.entries(vehicleMap).map(
    ([vehicle, banks]) => `${vehicle} {${Array.from(banks).sort().join(", ")}}`
  );
  console.log({ finalResult });

  return finalResult;
}
