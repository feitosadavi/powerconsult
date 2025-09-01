import { Page } from "playwright";
import { BankCreds } from "../playground";

export type AvailableBanks = "bancopan" | "bradesco" | "itau";
export const availableBanksList: AvailableBanks[] = [
  "itau",
  "bancopan",
  "bradesco",
];

export type SimulationInput = {
  cpf: string;
  bankCreds: BankCreds;
  page: Page;
};

export type SimulationOutput = Partial<Record<AvailableBanks, any>>;
