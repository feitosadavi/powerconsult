import { Page } from "playwright";

export type AvailableBanks = "bancopan" | "bradesco" | "itau";
export const availableBanksList: AvailableBanks[] = [
  "itau",
  "bancopan",
  "bradesco",
];

export type SimulationInput = {
  cpf: string;
  page: Page;
};

export type SimulationOutput = Partial<Record<AvailableBanks, any>>;
