import { firefox } from "playwright";
import { customFetch, logger } from "./lib";
import { getEndpointFromCache, getJson, setJson } from "./infra/cacheHelpers";
import {
  ITAU_HEADERS,
  ITAU_ENDPOINTS,
  REDIS_TTL,
  ITAU_TOKEN,
} from "./constants";
import { log } from "node:console";
import { getAccessToken } from "./services/itau/getAccessToken";
import { BANKS } from "./banks";
import { decodeCharonParams, encodeCharonParams } from "./lib/charon";

function sanitizeHeaders(input: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (v === undefined || v === null) continue;
    // convert to string, remove control chars/newlines and trim
    let s = String(v)
      .replace(/[\r\n\t\0]+/g, " ")
      .trim();
    // strip any ASCII control chars
    s = s.replace(/\x00-\x1F/g, "");
    out[k] = s;
  }
  return out;
}

export const configureItau = async () => {
  logger("-> Configuring Itau");

  let headers = await getJson<Record<string, string>>(ITAU_HEADERS);
  if (!headers) headers = await setHeaders();

  await setUrls(headers);

  search(headers);
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
  // await setJson(ITAU_HEADERS, headersCollector, REDIS_TTL);
  return headersCollector;
}

async function setUrls(headers: Record<string, string>): Promise<void> {
  logger("-> getting URLs");
  const target = "https://apicd.cloud.itau.com.br/charon/brr13ot8";
  const headersForRequest = { ...headers };
  delete headersForRequest["x-charon-session"];

  const cleanedHeaders = sanitizeHeaders({
    ...headersForRequest,
    "x-charon-params":
      "eyJ1cGRhdGVzIjpudWxsLCJjbG9uZUZyb20iOm51bGwsImVuY29kZXIiOnt9LCJtYXAiOm51bGx9",
    "x-apigw-api-id": "v0vb31ek5l",
  });

  const resp = await customFetch<any>(target, {
    method: "GET",
    headers: cleanedHeaders as Record<string, string>,
    timeout: 10_000,
  });

  const links = Array.isArray(resp?.links) ? resp.links : [];

  await setJson(ITAU_ENDPOINTS, links, REDIS_TTL);

  // Return hrefs for convenience
  return links.map((l: any) => l.href).filter(Boolean);
  // } catch (e) {
  //   log(e)
  //   logger(`-> getUrls fetch failed: ${String(e)}`);
  // }
}

async function search(headers: any): Promise<void> {
  const { href, method } = await getEndpointFromCache("getVehicleSearch");

  const accessToken =
    "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJKTDFtWXY4RW1ka3VRMHg2TmJWek1udWxDc2RCMFlGbzhISzhTdDBWZkhZIn0.eyJleHAiOjE3NTk5NTg4NjUsImlhdCI6MTc1OTk1NTI2NSwiYXV0aF90aW1lIjoxNzU5OTM1MzM2LCJqdGkiOiI2NmIyNjkwYy02ZWJiLTQ0ODUtYjFlNy1iN2FmZjIxNmViODQiLCJpc3MiOiJodHRwczovL2FjY291bnRzLXZlaGljbGUuaXRhdS5jb20uYnIvYXV0aC9yZWFsbXMvemZsb3ciLCJhdWQiOlsiZmluYW5jZUFwaSIsImFjY291bnQiXSwic3ViIjoiMDFjYmE4ZDYtODJlOS00ZTE3LThhMzctY2U5NzU5MjU2NDdmIiwidHlwIjoiQmVhcmVyIiwiYXpwIjoiY3JlZGxpbmVpdGF1Iiwibm9uY2UiOiJUbVYwTGpGcWR6SkNaRVl6YVhsSmRXMWljREo1TTBFM01ucElVVEJvY1hSd1pETTJNV1JhUlVkYVNuUnUiLCJzZXNzaW9uX3N0YXRlIjoiMDA4MmU4NDUtNDkyMC00NGE2LTlhZDMtZDM2ZjFjNzkwYTFlIiwiYWxsb3dlZC1vcmlnaW5zIjpbImh0dHBzOi8vY3JlZGxpbmUtZnJvbnRlbmQtYmx1ZS1ob20uY2xvdWQuaXRhdS5jb20uYnIiLCJodHRwczovL2NyZWRsaW5lLWRlYWxlci56Zmxvdy5jb20uYnIiLCJodHRwczovL2NyZWRsaW5lLWh1YnBqLnpmbG93LmNvbS5iciIsImh0dHBzOi8vY2hhbm5lbHMuemZsb3cuY29tLmJyIiwiaHR0cHM6Ly9jcmVkbGluZS1pdGF1ZHIuemZsb3cuY29tLmJyIiwiaHR0cHM6Ly9jcmVkbGluZS1tYWluc3RyZWFtLnpmbG93LmNvbS5iciIsImh0dHBzOi8vc3RhdGljLnpmbG93LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmUtZnJvbnRlbmQtYmx1ZS5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmVpdGF1LWhvbS5jbG91ZC5pdGF1LmNvbS5ici8iLCJodHRwczovL2NyZWRsaW5lamxyLWRldi5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmUtZW5hYmxlci56Zmxvdy5jb20uYnIiLCJodHRwczovL2NyZWRsaW5laXRhdS56Zmxvdy5jb20uYnIiLCJodHRwczovL2NyZWRsaW5lLWRldi56Zmxvdy5jb20uYnIiLCJodHRwczovL21pY3JvZnJvbnRlbmQuY2xvdWQuaXRhdS5jb20uYnIiLCJodHRwczovL2NyZWRsaW5lLXN0YWdpbmcuemZsb3cuY29tLmJyIiwiaHR0cDovL2ZpbmFuY2UtY2xpZW50ZS1wcm9qZWN0LXBob2VuaXgtY3JlZGxpbmUuc3ZjOS5wcm9kLmF3cy5jbG91ZC5paGYvIiwiaHR0cHM6Ly9jcmVkbGluZS1kZXZpdGF1LnpmbG93LmNvbS5iciIsImh0dHBzOi8vbWZlLXNpbXVsYXRpb24tY3JlZGxpbmUuY2xvdWQuaXRhdS5jb20uYnIiLCJodHRwczovL2NyZWRsaW5laXRhdS1ob20uY2xvdWQuaXRhdS5jb20uYnIvKiIsImh0dHBzOi8vY3JlZGxpbmVpdGF1LWhvbS5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vdmVpY3Vsb3MtZGV2LmNsb3VkLml0YXUuY29tLmJyIiwiaHR0cHM6Ly9jcmVkbGluZS1pdGF1LWdyZWVuLmNsb3VkLml0YXUuY29tLmJyIiwiaHR0cHM6Ly9jcmVkbGluZS1lbXByZXNhcy56Zmxvdy5jb20uYnIiLCJodHRwczovL2NyZWRsaW5lamxyLWhvbS5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmVpdGF1LWRldi5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmUtaXRhdS1ibHVlLWdyZWVuLmNsb3VkLml0YXUuY29tLmJyIiwiaHR0cHM6Ly92ZWljdWxvcy1wcm9kLmNsb3VkLml0YXUuY29tLmJyIiwiaHR0cHM6Ly9jcmVkbGluZWl0YXUtcHJvZC5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vYWNjb3VudHMtdmVoaWNsZS5pdGF1LmNvbS5ici8qIiwiaHR0cHM6Ly9jcmVkbGluZWl0YXUuY2xvdWQuaXRhdS5jb20uYnIiLCJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJodHRwczovL2NyZWRsaW5lamxyLXByb2QuY2xvdWQuaXRhdS5jb20uYnIiLCJodHRwOi8vMTAuMC4xMC4yMDk6MzAwMCIsImh0dHBzOi8vYmZmc2ltdWxhdGlvbmNyZWRsaW5lLmlzdGlvLmZvdW5kYXRpb24uYXdzLmNsb3VkLmloZiIsImh0dHBzOi8vdmVpY3Vsb3MtaG9tLmNsb3VkLml0YXUuY29tLmJyIiwiaHR0cHM6Ly9taWNyb2Zyb250ZW5kLmRldi5jbG91ZC5pdGF1LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmVpdGF1LXByb2QuY2xvdWQuaXRhdS5jb20uYnIvKiIsImh0dHBzOi8vY3JlZGxpbmVqbHItaHVicGouemZsb3cuY29tLmJyLyIsImh0dHA6Ly9zdGFnaW5nOjMwMDAiLCJodHRwczovL2NyZWRsaW5lLWRlYWxlci56Zmxvdy5jb20uYnIvIiwiaHR0cHM6Ly9hY2NvdW50cy12ZWhpY2xlLml0YXUuY29tLmJyIiwiaHR0cHM6Ly9jcmVkbGluZS1ob21vbG9naXRhdS56Zmxvdy5jb20uYnIiLCJodHRwczovL2NyZWRsaW5lamxyLWhvbS5jbG91ZC5pdGF1LmNvbS5ici8qIiwiaHR0cHM6Ly9jcmVkbGluZS1kZXYyLnpmbG93LmNvbS5iciIsImh0dHBzOi8vd3d3LmNyZWRsaW5laXRhdS5jb20uYnIvKiIsImh0dHBzOi8vY3JlZGxpbmVpdGF1LmNvbS5iciIsImh0dHBzOi8vY3JlZGxpbmUtcGYuemZsb3cuY29tLmJyIiwiaHR0cHM6Ly93d3cuY3JlZGxpbmVpdGF1LmNvbS5iciJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLXpmbG93IiwidW1hX2F1dGhvcml6YXRpb24iXX0sInJlc291cmNlX2FjY2VzcyI6eyJmaW5hbmNlQXBpIjp7InJvbGVzIjpbImNyZWRpdC1hbmFseXNpcyIsInVubG9jay1uZXctc2ltdWxhdG9yLWNyZWRsaW5lLXBmIiwiZmluYW5jZS1zaW11bGF0aW9uIiwiY3JlYXRlLXRyYW5zYWN0aW9uIiwidmlldy1tZmUtY3Jvc3Mtc2VsbC1wcm9kdWN0cyIsIm5ldy11eC1keW5hbWljLWhlYWRlciJdfSwiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsIm1hbmFnZS1hY2NvdW50LWxpbmtzIiwidmlldy1wcm9maWxlIl19fSwic2NvcGUiOiJvcGVuaWQiLCJzaWQiOiIwMDgyZTg0NS00OTIwLTQ0YTYtOWFkMy1kMzZmMWM3OTBhMWUiLCJuYW1lIjoiTWFyaW8gSm9hcXVpbSBNZWxvIGRhIFNpbHZhIEp1bmlvciIsInByZWZlcnJlZF91c2VybmFtZSI6InBvd2VyZnVsdmVpY3Vsb3NkZkBnbWFpbC5jb20iLCJnaXZlbl9uYW1lIjoiTWFyaW8iLCJmYW1pbHlfbmFtZSI6IkpvYXF1aW0gTWVsbyBkYSBTaWx2YSBKdW5pb3IiLCJlbWFpbCI6InBvd2VyZnVsdmVpY3Vsb3NkZkBnbWFpbC5jb20ifQ.pb7tcHuzUaYehDN4yCa_6T-vNMhDXN12w25432jbECltX42Ii28egccT77-YUqV4coWkm761vtajZq2Sj50G-CjvgfKzvcw_t660kawFlbiDiA2PV_qJkpn-csWvJHs0FYVsiW0j3nJSgYjjeJWxV8lYxDlO8TMWNEj3fAlnFh91xz6oQAcIUFMdHTPz9GYQRzHGAEQQgvvQ5rqZy-ouY13daoKD4Bm-r_j2wDOb7sNvTm-iNjTaqgglwP5KtE13QLDEdjxg7EimAgmoS0uSc5wTBiBLDW7o9OurNdnVktMYebZYfm19ty7Mhoz-JQxxXgzHoaxN18lrFJbUykqKMA";
  const accessToken2 = (await getAccessToken(BANKS.itau.creds)).token
    .accessToken;
  // os headers precisam ser atualizados
  headers = {
    ...headers,
    Authorization: `Bearer ${accessToken2}`,
    "x-apigw-api-id": "v0vb31ek5l",
    "x-charon-params": encodeCharonParams({
      year: 2026,
      zeroKm: false,
      model: "volks",
      segment: 45494125000153,
      externalReference: true,
    }),
    // "x-charon-session": "767c766d-0244-4aca-965e-b92c0c80092d",
    // "x-itau-apikey": "bd0fb09f0179b8d899bd7be7404158bd0713462fc9bc1a88723de71e896de0e0501528201882cd5e7dc1fd9115725833",
    // "x-itau-correlationid": "a4d0347d-0f9f-4710-8fce-0588e29f1db3",
    // "x-itau-flowid": "e026e577-a49e-491f-855c-c5678e6fc92d"
  };
  console.log({ headers, href });
  const href2 =
    "https://apicd.cloud.itau.com.br/charon/brr13ot8/df0456769b271f88";
  const resp = await customFetch<any>(
    `${href}?year=2026&zeroKm=false&model=volks&segment=45494125000153&externalReference=true`,
    {
      method,
      headers,
      timeout: 10_000,
    }
  );

  console.log(resp);

  const links = Array.isArray(resp?.links) ? resp.links : [];

  await setJson(ITAU_ENDPOINTS, links, REDIS_TTL);

  // Return hrefs for convenience
  return links.map((l: any) => l.href).filter(Boolean);
  // } catch (e) {
  //   log(e)
  //   logger(`-> getUrls fetch failed: ${String(e)}`);
  // }
}

configureItau();
