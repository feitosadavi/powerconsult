import { Page } from "playwright";
import { logger } from "../../lib";

export default async function getBancopanVehicleOptions({
  year,
  vehicle,
  cpf,
  zeroKm,
  hasCnh,
  isTaxiDriver,
  isPCD,
  page,
}: GetBancopanVehiclesService.Input): Promise<GetBancopanVehiclesService.Output> {
  logger(`-> bancopan getVehicleOption page url ${page.url()}`);
  return { bancopan: [`Fiat Uno`, `Fiat Toro`] };
}

export namespace GetBancopanVehiclesService {
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
  export type Output = { bancopan: string[] };
}
