// banks.ts
import { ServiceInput } from "./domain";
import { bancopanService } from "./services/bancopanService";
import { bradescoService } from "./services/bradescoService";

export type AvailableBanks = "bancopan" | "bradesco";
export const availableBanksList: AvailableBanks[] = ["bancopan", "bradesco"];

export type ServiceOutput = Partial<Record<AvailableBanks, any>>;

type Banks = {
  [key in AvailableBanks]: {
    service: (input: ServiceInput) => Promise<ServiceOutput>;
    creds: {
      username: string;
      password: string;
    };
  };
};

export const BANKS: Banks = {
  bancopan: {
    service: bancopanService,
    creds: {
      username: "66956463172",
      password: "Feroz2025*",
    },
  },
  bradesco: {
    service: bradescoService,
    creds: {
      username: "V1053.49893",
      password: "Power25$",
    },
  },
};
