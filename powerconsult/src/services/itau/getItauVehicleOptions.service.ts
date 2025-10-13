import { Page } from "playwright";
import { redis } from "../../infra/redis";
import { ITAU_TOKEN } from "../../constants";
import {
  launchFromSnapshot,
  logger,
  ManifestEntry,
  saveResponse,
  saveSnapshotArtifacts,
  snapshotSite,
} from "../../lib";
import { getAccessToken } from "./getAccessToken";
import { log } from "node:console";
import getItauSimulation from "./getItauSimulations";
import isItauAvailableForFinancing from "./isItauAvailableForFinancig";

export default async function getItauVehicleOptions({
  year,
  vehicle,
  cpf,
  state,
  hasCnh,
  isTaxiDriver,
  isPCD,
  page,
}: GetItauVehiclesService.Input): Promise<GetItauVehiclesService.Output> {
  logger(`-> itau getVehicleOption page url ${page.url()}`);
  if (page.url() === "about:blank") {
    logger(`-> itau page url is about:blank`);
    const res = await isItauAvailableForFinancing({ page, cpf });

    logger(`-> itau not available for financing`);
    if (!res.itau?.success?.financing) {
      return { itau: [] };
    }
  }
  await page.locator(STATE_OPTIONS[state]).click();

  return { itau: [`Fiat Uno`, `Fiat Toro`] };
}

type State = "usado" | "0km";

const STATE_OPTIONS: Record<State, string> = {
  usado: "ids-radio-button-1",
  "0km": "ids-radio-button-2",
};

export namespace GetItauVehiclesService {
  export type Input = {
    year: string;
    state: State;
    vehicle: string;
    cpf: string;
    page: Page;
    hasCnh: boolean;
    isTaxiDriver: boolean;
    isPCD: boolean;
  };
  export type Output = { itau: string[] };
}
