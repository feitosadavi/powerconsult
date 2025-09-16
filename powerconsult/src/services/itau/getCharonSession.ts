import { firefox } from "playwright";
import { logger } from "../../lib";
import { redis } from "../../config/redis";
import { CHARON_SESSION } from "../../constants";

type Item = { manufacture: number; model: number; label: string };

type GetCharonSessionOutput = {
  charon: string;
  vehicleYears: any;
  preAnalysis?: any;
  preAnalysisUrl: string;
  getVehicleYearsUrl: string;
  getVehicleSearchUrl: string;
};

export async function getCharonSession(
  token: any,
  cpf: string
): Promise<GetCharonSessionOutput> {
  logger("-> Getting itau charon");

  const cached = await redis.get(CHARON_SESSION);
  if (cached) {
    logger("-> itau has cache charon");
    return JSON.parse(cached);
  }
  logger("-> itau dont have cache charon");

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext();

  await context.addInitScript(
    (t) => window.sessionStorage.setItem("token", JSON.stringify(t)),
    token
  );

  const page = await context.newPage();

  const collector = attachResponseCollector(page, {
    startsWith: true,
  });

  await page.goto("https://www.credlineitau.com.br/new-simulator");

  // Preenche e clica continuar
  await page.locator("#ids-input-0").pressSequentially(cpf, { delay: 100 });
  await page.locator("#continuar-button").click();

  // Coleta dados do sessionStorage como antes
  const { charon, preAnalysisUrl, getVehicleYearsUrl, getVehicleSearchUrl } =
    await page.evaluate(() => {
      const charon = window.sessionStorage.getItem(
        "simulator_mfe_charon_session"
      );
      const cypressData = window.sessionStorage.getItem("cypressData");
      const functions = cypressData ? JSON.parse(cypressData) : [];
      const [getVehicleYearsUrl, preAnalysisUrl, getVehicleSearchUrl] =
        functions
          .filter((link: any) =>
            ["getVehicleYears", "preAnalysis", "getVehicleSearch"].includes(
              link.rel
            )
          )
          .sort((a: any, b: any) => {
            if (a.rel === "getVehicleYears") return -1;
            if (b.rel === "getVehicleYears") return 1;
            return 0;
          })
          .map((data: any) => data.href);
      return {
        charon,
        preAnalysisUrl,
        getVehicleYearsUrl,
        getVehicleSearchUrl,
      };
    });

  const vehicleYears = (await collector.getOrWait(getVehicleYearsUrl, 30000))
    .data;
  const preAnalysis = (await collector.getOrWait(preAnalysisUrl, 30000)).data;

  // Anexa o que encontramos na rede
  const fullOutput: GetCharonSessionOutput = {
    charon: charon || "",
    preAnalysisUrl: preAnalysisUrl,
    getVehicleYearsUrl: getVehicleYearsUrl,
    getVehicleSearchUrl,
    vehicleYears,
  };

  await redis.set(CHARON_SESSION, JSON.stringify(fullOutput));

  // Se quiser encerrar o browser aqui:
  await browser.close();

  return { ...fullOutput, preAnalysis };
}

type MatchResult = { url: string; data?: any; rawBase64?: string };

function attachResponseCollector(
  page: import("playwright").Page,
  {
    method, // "GET" | "POST" | undefined
    startsWith = false, // true = prefix, false = exact
  }: { method?: "GET" | "POST"; startsWith?: boolean } = {}
) {
  const seen: MatchResult[] = [];
  const waiters: Array<{
    targetUrl: string;
    resolve: (r: MatchResult) => void;
  }> = [];

  const matches = (url: string, target: string, byPrefix: boolean) =>
    byPrefix ? url.startsWith(target) : url === target;

  const handler = async (res: import("playwright").Response) => {
    try {
      const req = res.request();
      if (method && req.method() !== method) return;

      const url = res.url();

      // Try JSON first
      let parsed: any | undefined;
      try {
        const text = await res.text();
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }
      } catch {
        // ignore, will try binary below
      }

      let entry: MatchResult;
      if (parsed !== undefined) {
        entry = { url, data: parsed };
      } else {
        try {
          const buf = await res.body(); // Playwright Buffer
          entry = { url, rawBase64: buf.toString("base64") };
        } catch {
          return; // couldn’t read; skip
        }
      }

      // Store
      seen.push(entry);

      // Resolve any waiter that matches this url
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (matches(url, w.targetUrl, startsWith)) {
          waiters.splice(i, 1);
          w.resolve(entry);
        }
      }
    } catch {
      // ignore
    }
  };

  page.on("response", handler);

  return {
    /**
     * First checks the cache of previous responses; if none, waits for the next one.
     */
    async getOrWait(
      targetUrl: string,
      timeoutMs = 30_000
    ): Promise<MatchResult> {
      // 1) check previous matches
      const cached = seen.find((r) => matches(r.url, targetUrl, startsWith));
      if (cached) return cached;

      // 2) wait for next match
      return new Promise<MatchResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          // remove this waiter on timeout
          const idx = waiters.findIndex((w) => w.resolve === resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(
            new Error(
              `Timeout waiting for ${method ?? "ANY"} ${
                startsWith ? "prefix" : "exact"
              } URL: ${targetUrl}`
            )
          );
        }, timeoutMs);

        waiters.push({
          targetUrl,
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
        });
      });
    },

    dispose() {
      page.off("response", handler);
    },
  };
}
