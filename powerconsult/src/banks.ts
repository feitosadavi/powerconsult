import { AvailableBanks } from "./domain";
import {
  getItauSimulation,
  isItauAvailableForFinancig,
  getBancopanVehicleOptions,
  getItauVehicleOptions,
} from "./services";
import { configureItau } from "./services/itau/configureItau";

export type ServiceName =
  | "isAvailableForFinancing"
  | "getSimulation"
  | "getVehicleOptions"
  | "config";

export type BankCreds = { username: string; password: string };
export type StoreBankCreds = { [K in AvailableBanks]?: BankCreds };

type Banks = {
  [key in AvailableBanks]: {
    services: Record<ServiceName, (...args: any) => any>;
    creds: {
      username: string;
      password: string;
    };
  };
};

export const BANKS: Banks = {
  bancopan: {
    services: {
      getSimulation: (input: any) => Promise.resolve({ bancopan: {} }),
      isAvailableForFinancing: (input: any) =>
        Promise.resolve({ bancopan: {} }),
      getVehicleOptions: getBancopanVehicleOptions,
      config: (creds: BankCreds) =>
        Promise.resolve({ bancopan: {} }),
    },
    creds: {
      username: "66956463172",
      password: "Feroz2025*",
    },
  },
  itau: {
    services: {
      getVehicleOptions: getItauVehicleOptions,
      getSimulation: getItauSimulation,
      isAvailableForFinancing: isItauAvailableForFinancig,
      config: (creds: BankCreds, storeId: string) => configureItau(creds, storeId),
    },
    creds: {
      username: "powerfulveiculosdf@gmail.com",
      password: "Mario2025#",
    },
  },
  bradesco: {
    services: {
      getVehicleOptions: () => Promise.resolve({ bradesco: null }),
      getSimulation: (input: any) => Promise.resolve({ bancopan: {} }),
      isAvailableForFinancing: (input: any) => Promise.resolve({ itau: {} }),
      config: (creds: BankCreds) =>
        Promise.resolve({ bancopan: {} }),
    },
    creds: {
      username: "V1053.49893",
      password: "Power25$",
    },
  },
};
