// // login-flow.ts

import { Page } from "playwright";
import browser from "./src/infra/browser";
import { getCacheAuthToken, logger } from "./src/lib";
import { ITAU_TOKEN } from "./src/constants";
import { AvailableBanks } from "./src/domain";

// // Execução
// (async () => {
//   try {
//     const accessToken = await getAccessToken();
//     accessTokenGlobal = accessToken;

//     const apiUrl =
//       "https://apicd.cloud.itau.com.br/charon/brr13ot8/9fecca81a835b498";

//     const payload: ApiPayload = {
//       sellerDocument: "45494125000153",
//       statusAnalysis: "RED",
//       segment: null,
//       dismissalCnhEnable: true,
//       clientDocument: "72048255191",
//       customer: false,
//     };

//     const apiRes = await fetch(apiUrl, {
//       method: "POST",
//       headers: getHeaders(accessToken),
//       body: JSON.stringify(payload),
//     });

//     const apiResult = await apiRes.json().catch(() => ({}));

//     console.log("\n✅ Resposta da API:");
//     console.log("Status:", apiRes.status);
//     console.log("Body:", apiResult);
//   } catch (err) {
//     console.error("Erro:", err);
//     process.exit(1);
//   }
// })();

const SESSION_STORAGE_KEYS: Record<AvailableBanks, string> = {
  itau: ITAU_TOKEN,
  bancopan: "token",
  bradesco: "token",
};

async function main() {
  let page: Page | null = null;

  try {
    const page = await (await browser.getBrowser()).newPage()

    const token = await getCacheAuthToken('itau', 'store');
    // logger(`-> Adding sessionToken`, user);
    // Injeta token de sessão ANTES de qualquer script da página
    await page.addInitScript(
      (cfg: { key: string; value: string }) => {
        try {
          sessionStorage.setItem(cfg.key, cfg.value);
          sessionStorage.setItem("valid_token", "true");
        } catch {}
      },
      {
        key: ITAU_TOKEN,
        value: token,
      }
    );

    page.locator("#ids-input-0").pressSequentially('03624797123', { delay: 100 });
    await page.click("#continuar-button");

    
  } catch (error: any) {

  } finally {

  }
}

main()
