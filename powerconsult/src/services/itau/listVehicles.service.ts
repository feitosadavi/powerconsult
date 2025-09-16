import { redis } from "../../config/redis";
import { CHARON_SESSION, ITAU_TOKEN } from "../../constants";
import {
  launchFromSnapshot,
  logger,
  ManifestEntry,
  saveResponse,
  saveSnapshotArtifacts,
  snapshotSite,
} from "../../lib";
import { getAccessToken } from "./auth";
import { getHeaders } from "./config";
import { getCharonSession } from "./getCharonSession";

export default async function isItauAvailableForFinancing({
  year,
  zeroKm,
  model,
  cpf,
}: ListVehiclesService.Input): Promise<ListVehiclesService.Output> {
  logger("-> itau fetching preAnalysis");

  const accessToken = await getAccessToken({} as any);
  const snap = await snapshotSite({
    url: "https://credlineitau.com.br/new-simulator",
    key: "seuapp:dev:gabriel",
    headless: false,
    includeXHR: true,
    accessToken: { key: "token", value: accessToken },
  });

  const entries: Map<string, ManifestEntry> = new Map();
  snap.page.on("response", async (res) => {
    const output = await saveResponse({
      includeXHR: true,
      snapshotDir: snap.snapshotDir,
      res,
    });
    if (output !== undefined) entries.set(output.name, output.value);
  });

  await snap.page.reload();
  // Interações que disparam mais assets
  await snap.page
    .locator("#ids-input-0")
    .pressSequentially(cpf, { delay: 100 });
  await snap.page.locator("#continuar-button").click();

  // >>> SALVAR artefatos ANTES de fechar o contexto <<<
  await saveSnapshotArtifacts(snap.page, snap.context, {
    snapshotDir: snap.snapshotDir, // veio do snapshotSite
    manifestPath: snap.manifestPath, // veio do snapshotSite
    storagesPath: snap.storagesPath, // veio do snapshotSite
    entries: snap.entries, // Map<string, ManifestEntry> do snapshot
    url: "https://credlineitau.com.br/new-simulator",
  });

  await snap.context.close(); // agora pode fechar (HAR/arquivos já salvos)
  await snap.browser.close();

  const first = await launchFromSnapshot({
    url: "https://credlineitau.com.br/new-simulator",
    key: "seuapp:dev:gabriel",
    headless: false,
    offline: false,
  });

  await first.page.waitForTimeout(100000);

  await first.page.waitForLoadState("load");
  // conteúdo veio 100% do HAR
  await first.context.close();
  await first.browser.close();

  return {
    itau: true,
  };
  // try {
  //   const token = await getAccessToken();

  //   let {
  //     preAnalysisUrl,
  //     preAnalysis,
  //     vehicleYears,
  //     getVehicleSearchUrl,
  //     charon,
  //   } = await getCharonSession(token, cpf);

  //   const response = await fetch(
  //     `${getVehicleSearchUrl}?year=${year}&zeroKm=${zeroKm}&model=${model}&segment=45494125000153&externalReference=true`,
  //     {
  //       method: "POST",
  //       headers: getHeaders({
  //         accessToken: token.token.accessToken,
  //         charonSession: charon,
  //       }),
  //       body: JSON.stringify({
  //         sellerDocument: "45494125000153",
  //         clientDocument: cpf,
  //       }),
  //     }
  //   );
  //   console.log(response);

  //   if (response.status !== 200) throw new Error("Forbidden");
  //   const json = response.json();

  //   return {
  //     itau: {
  //       success: json,
  //     },
  //   };
  // } catch (error) {
  //   console.error(error);
  //   redis.del(CHARON_SESSION);
  //   redis.del(ITAU_TOKEN);
  //   return await isItauAvailableForFinancing({ year, zeroKm, model, cpf });
  // }
}

type CharonParams = {
  updates: unknown;
  cloneFrom: unknown;
  encoder: Record<string, unknown>;
  map: unknown;
};

export function encodeCharon(params: CharonParams, urlSafe = false): string {
  const json = JSON.stringify({
    updates: params.updates,
    cloneFrom: params.cloneFrom,
    encoder: params.encoder,
    map: params.map,
  });
  const b64 =
    typeof window !== "undefined" && typeof window.btoa === "function"
      ? btoa(json)
      : Buffer.from(json, "utf8").toString("base64");
  return urlSafe
    ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : b64;
}

export namespace ListVehiclesService {
  export type Input = {
    year: string;
    zeroKm?: boolean;
    model: string;
    cpf: string;
  };
  export type Output = {};
}
