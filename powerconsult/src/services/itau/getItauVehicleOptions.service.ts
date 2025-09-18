import { Page } from "playwright";
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
import { log } from "node:console";

export default async function isItauAvailableForFinancing({
  year,
  vehicle,
  cpf,
  zeroKm,
  hasCnh,
  isTaxiDriver,
  isPCD,
  page,
}: GetItauVehiclesService.Input): Promise<GetItauVehiclesService.Output> {
  logger(`-> itau getVehicleOption page url ${page.url()}`);
  return { itau: [`Fiat Uno`, `Fiat Toro`] };
}

export namespace GetItauVehiclesService {
  export type Input = {
    year: string;
    zeroKm?: boolean;
    vehicle: string;
    cpf: string;
    page: Page;
    hasCnh: boolean;
    isTaxiDriver: boolean;
    isPCD: boolean;
  };
  export type Output = { itau: string[] };
}
