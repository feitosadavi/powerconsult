import { Page } from "playwright";
import { SimulationInput, SimulationOutput } from "../../domain";
import { logger } from "../../lib";

export default async function isItauAvailableForFinancing({
  cpf,
  page,
}: SimulationInput): Promise<SimulationOutput> {
  await page.goto("https://www.credlineitau.com.br/new-simulator", {
    waitUntil: "domcontentloaded",
  });
  const payloads: any[] = [];
  page.on("response", async (res) => {
    try {
      const ct = (res.headers()["content-type"] || "").toLowerCase();
      if (!ct.includes("application/json")) return;

      const data = await res.json();

      if (
        data?.statusAnalysis !== undefined ||
        data[0]?.manufacture !== undefined
      ) {
        payloads.push(data);
      }
    } catch {
      // ignore non-JSON or errors
    }
  });
  page.locator("#ids-input-0").pressSequentially(cpf, { delay: 100 });
  await page.click("#continuar-button");
  await page.waitForTimeout(5000);

  logger("-> finish isItauAvailableForFinancing");

  return {
    itau: {
      success: {
        financing: payloads[0].statusAnalysis === "GREEN",
        vehicleYears: payloads[1],
      },
    },
  };
}

export function watchForTwoPayloads(
  page: Page,
  timeout = 30_000
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const payloads: any[] = [];
    const timer = setTimeout(() => {
      page.off("response", handler as any);
      reject(new Error("Timed out waiting for two payloads"));
    }, timeout);

    async function handler(res: Response) {
      try {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) return;

        const data = await res.json();
        if (
          data?.statusAnalysis !== undefined ||
          data?.manufacture !== undefined
        ) {
          payloads.push(data);
          if (payloads.length === 2) {
            clearTimeout(timer);
            page.off("response", handler as any);
            resolve(payloads);
          }
        }
      } catch {}
    }

    page.on("response", handler as any);
  });
}
