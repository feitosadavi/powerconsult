import { SimulationOutput } from "../../domain";

export default async function isItauAvailableForFinancing(): Promise<SimulationOutput> {
  return Promise.resolve({ itau: true });
}
