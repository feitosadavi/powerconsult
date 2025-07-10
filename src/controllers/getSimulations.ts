import { AvailableBanks, BANKS, ServiceOutput } from "../banks";

export async function getSimulationsController({
  cpf,
  bancos,
}: GetSimulationsController.Input) {
  const res: ServiceOutput[] = [];
  for (const banco of bancos) {
    const output = await BANKS[banco].service();
    res.push(output);
  }
  return res;
}

export namespace GetSimulationsController {
  export type Input = {
    cpf: string;
    bancos: AvailableBanks[];
  };
}
