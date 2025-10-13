import { firefox } from "playwright";
import { logger } from "../../lib";
import { ITAU_HEADERS, ITAU_URLS, REDIS_TTL } from "../../constants";
import { getJson, setJson } from "../../infra/cacheHelpers";
import { customFetch } from "../../lib/fetch";


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
