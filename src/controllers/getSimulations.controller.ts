import { BANKS } from "../banks";
import { AvailableBanks } from "../domain";

export async function getSimulationsController({
  cpf,
  bancos,
  checkFinancingAvailability,
}: GetSimulationsController.Input) {
  const methodName = checkFinancingAvailability
    ? "isAvailableForFinancing"
    : "getSimulation";

  const results = await Promise.all(
    bancos.map(async (banco) => {
      if (!BANKS[banco]) return {};

      try {
        const output = await BANKS[banco][methodName]({ cpf });
        return output;
      } catch (error) {
        console.error(error);
        return {
          [banco]: {
            error:
              (error as Error).message === "Timeout"
                ? `O serviço do ${banco} está offline`
                : error,
          },
        };
      }
    })
  );

  return Object.assign({}, ...results);
}

export namespace GetSimulationsController {
  export type Input = {
    cpf: string;
    bancos: AvailableBanks[];
    checkFinancingAvailability?: boolean;
  };
}
