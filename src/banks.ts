import { bancopanService } from "./services";

export type AvailableBanks = "bancopan";
export const AvailableBanks: AvailableBanks[] = ["bancopan"];
export type ServiceOutput = {};

type Banks = {
  [key in AvailableBanks]: {
    baseUrl: string;
    service: () => Promise<ServiceOutput>;
    endpoints: {
      login: string;
    };
    creds: {
      user: string;
      password: string;
    };
  };
};

export const BANKS: Banks = {
  bancopan: {
    baseUrl: "https://veiculos.bancopan.com.br",
    service: bancopanService,
    endpoints: {
      login: "https://veiculos.bancopan.com.br/login",
    },
    creds: {
      user: "66956463172",
      password: "Feroz2025*",
    },
  },
};
