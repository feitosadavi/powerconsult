import { AvailableBanks, BANKS } from "../banks";

export async function getSimulationsController({
  cpf,
  bancos,
}: GetSimulationsController.Input) {
  let res: any = {};
  for (const banco of bancos) {
    if (BANKS[banco]) {
      try {
        const output = await BANKS[banco].service({ cpf });
        res = { ...res, ...output };
      } catch (error) {
        console.log(error);

        res = {
          ...res,
          [banco]: {
            error:
              (error as Error).message === "Timeout"
                ? `O serviço do ${banco} está offline`
                : error,
          },
        };
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
