import { firefox } from "playwright";
import { BankCreds } from "../../banks";
import { ITAU_HEADERS, ITAU_ENDPOINTS, REDIS_TTL } from "../../constants";
import { getJson, setJson } from "../../infra/cacheHelpers";
import { customFetch, logger } from "../../lib";
import { getAccessToken } from "./getAccessToken";

export const configureItau = async (creds: BankCreds, storeId: string) => {
  logger("-> Configuring Itau");
  await getAccessToken(creds, storeId);

  let headers = await getJson<Record<string, string>>(ITAU_HEADERS);
  if (!headers) headers = await setHeaders();

  const itauUrls = await getJson<Record<string, string>>(ITAU_ENDPOINTS);
  if (!itauUrls) await setUrls(headers);  
};

async function setHeaders() {
  logger("-> getting headers");

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext();

  const page = await context.newPage();

  const ITAU_CHARON_URL = "https://apicd.cloud.itau.com.br/charon/ylejy22p";
  const headersCollector: Record<string, string> = {};

  // Listen to request event to capture outgoing request headers matching the URL
  const reqHandler = (req: import("playwright").Request) => {
    try {
      const url = req.url();
      if (url === ITAU_CHARON_URL) {
        const hdrs = req.headers();
        Object.assign(headersCollector, hdrs);
      }
    } catch {
      // ignore
    }
  };
  page.on("request", reqHandler);

  await page.goto("https://www.credlineitau.com.br/new-simulator", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(5000);
  await setJson(ITAU_HEADERS, headersCollector, REDIS_TTL);
  return headersCollector;
}

async function setUrls(headers: Record<string, string>): Promise<void> {
  const target = "https://apicd.cloud.itau.com.br/charon/brr13ot8";
  try {
    const resp = await customFetch<any>(target, {
      method: "GET",
      headers: headers as Record<string, string>,
      timeout: 10_000,
    });

    const links = Array.isArray(resp?.links) ? resp.links : [];

    await setJson(ITAU_ENDPOINTS, links, REDIS_TTL);

    // Return hrefs for convenience
    return links.map((l: any) => l.href).filter(Boolean);
  } catch (e) {
    logger(`-> getUrls fetch failed: ${String(e)}`);
  }
}

