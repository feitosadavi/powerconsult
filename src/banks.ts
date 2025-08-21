import { AvailableBanks, SimulationInput, SimulationOutput } from "./domain";
import { getItauSimulation, isItauAvailableForFinancig } from "./services";

type Banks = {
  [key in AvailableBanks]: {
    isAvailableForFinancing: (
      input: SimulationInput
    ) => Promise<SimulationOutput>;
    getSimulation: (input: SimulationInput) => Promise<SimulationOutput>;
    creds: {
      username: string;
      password: string;
    };
  };
};

export const BANKS: Banks = {
  bancopan: {
    getSimulation: (input: any) => Promise.resolve({ bancopan: {} }),
    isAvailableForFinancing: (input: any) => Promise.resolve({ bancopan: {} }),
    creds: {
      username: "66956463172",
      password: "Feroz2025*",
    },
  },
  itau: {
    getSimulation: getItauSimulation,
    isAvailableForFinancing: isItauAvailableForFinancig,
    creds: {
      username: "powerfulveiculosdf@gmail.com",
      password: "Mario2025#",
    },
  },
  bradesco: {
    getSimulation: (input: any) => Promise.resolve({ bancopan: {} }),
    isAvailableForFinancing: (input: any) => Promise.resolve({ itau: {} }),
    creds: {
      username: "V1053.49893",
      password: "Power25$",
    },
  },
};
