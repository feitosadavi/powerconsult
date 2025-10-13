import { BrowserContext, Page } from "playwright";
import { BANKS, ServiceName } from "../banks";
import { getBankCredsForStore, getCacheAuthToken, logger } from "../lib";
import { AvailableBanks } from "../domain";
import { ITAU_TOKEN } from "../constants";

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

type Service = {
  name: ServiceName;
  input: any;
};

const SESSION_STORAGE_KEYS: Record<AvailableBanks, string> = {
  itau: ITAU_TOKEN,
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
  console.log({ name: service.name });

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

export async function getSimulationsController({
  user,
  bancos,
  service,
  browserContext,
  taskTimeoutMs = 60_000,
}: {
  user: { userId: string; storeId: string };
  bancos: AvailableBanks[];
  service: { name: ServiceName; input: any }; // "isAvailableForFinancing"
  browserContext: BrowserContext;
  taskTimeoutMs?: number;
}) {
  logger(`-> Getting getSimulationsController`, user);

  const bankCreds = await getBankCredsForStore(user.storeId);

  const results = await Promise.allSettled(
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
  results.forEach(r => console.log(r))
  
  // Normaliza resultados (fulfilled/rejected) em um único objeto
  const merged = Object.assign(
    {},
    ...results.map((r, i) => {
      const banco = bancos[i];
      if (r.status === "fulfilled") return r.value || {};
      return { [banco]: { error: String(r.reason || "unknown error") } };
    })
  );

  return merged;
}
