import { AvailableBanks, BANKS, ServiceOutput } from "../banks";

export async function getSimulationsController({
  cpf,
  bancos,
}: GetSimulationsController.Input) {
  let res: any = {};
  const errors = [];
  for (const banco of bancos) {
    if (BANKS[banco]) {
      try {
        const output = await BANKS[banco].service({ cpf });
        res = { ...res, ...output };
      } catch (error) {
        errors.push(error);
      }
    }
  }

  return res;
}

export namespace GetSimulationsController {
  export type Input = {
    cpf: string;
    bancos: AvailableBanks[];
  };
}
