import { AvailableBanks } from "./domain";
import {
  getItauSimulation,
  isItauAvailableForFinancig,
  getBancopanVehicleOptions,
  getItauVehicleOptions,
} from "./services";

export type ServiceName =
  | "isAvailableForFinancing"
  | "getSimulation"
  | "getVehicleOptions";

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
    },
    creds: {
      username: "V1053.49893",
      password: "Power25$",
    },
  },
};
