import { SimulationInput, SimulationOutput } from "../../domain";

export default function getItauSimulation(
  input: SimulationInput
): Promise<SimulationOutput> {
  return Promise.resolve({ itau: {} });
}
