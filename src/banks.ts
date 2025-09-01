import { AvailableBanks, SimulationInput, SimulationOutput } from "./domain";
import {
  getItauSimulation,
  isItauAvailableForFinancig,
  listVehicles,
} from "./services";

export type ServiceName =
  | "isAvailableForFinancing"
  | "getSimulation"
  | "listVehicles";

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
      listVehicles: (input: any) => Promise.resolve({ bancopan: {} }),
    },
    creds: {
      username: "66956463172",
      password: "Feroz2025*",
    },
  },
  itau: {
    services: {
      listVehicles,
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
      listVehicles: () => Promise.resolve({ bradesco: null }),
      getSimulation: (input: any) => Promise.resolve({ bancopan: {} }),
      isAvailableForFinancing: (input: any) => Promise.resolve({ itau: {} }),
    },
    creds: {
      username: "V1053.49893",
      password: "Power25$",
    },
  },
};
