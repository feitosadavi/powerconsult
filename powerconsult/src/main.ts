import express, { json } from "express";
import { getSimulationsController } from "./controllers";
import { availableBanksList } from "./domain";
import { logger } from "./lib";
import { redis } from "./infra/redis";

const app = express();
app.use(json());

app.post("/availableBanks", async (req, res) => {
  const { bancos, cpf } = req.body;

  logger(`-> /availableBanks {${cpf}}`);

  if (!(bancos && cpf)) res.status(400).json("bancos or cpf faltando");

  const notRecognizedBanks = (bancos as string[]).filter(
    (banco: string) => banco in availableBanksList
  );

  if (notRecognizedBanks.length > 0)
    res
      .status(400)
      .json(`bancos não reconhecidos: ${notRecognizedBanks.join(", ")}`);

  const result = await getSimulationsController({
    bancos,
    service: {
      name: "isAvailableForFinancing",
      input: { cpf },
    },
  });

  res.json({ result });
});

app.post("/simular", async (req, res) => {
  const { bancos, cpf } = req.body;

  logger(`-> /simular {${cpf}}`);

  if (!(bancos && cpf)) res.status(400).json("bancos or cpf faltando");

  const notRecognizedBanks = (bancos as string[]).filter(
    (banco: string) => banco in availableBanksList
  );

  if (notRecognizedBanks.length > 0)
    res
      .status(400)
      .json(`bancos não reconhecidos: ${notRecognizedBanks.join(", ")}`);

  const result = await getSimulationsController({
    bancos,
    user: this?.user,
    browserContext: this.browserContext,
    service: {
      name: "getSimulation",
      input: { cpf },
    },
  });
  res.json({ result });
});

app.post("/listVehicles", async (req, res) => {
  const { bancos, cpf } = req.body;

  logger(`-> /listVehicles {${cpf}}`);

  if (!(bancos && cpf)) res.status(400).json("bancos or cpf faltando");

  const notRecognizedBanks = (bancos as string[]).filter(
    (banco: string) => banco in availableBanksList
  );

  if (notRecognizedBanks.length > 0)
    res
      .status(400)
      .json(`bancos não reconhecidos: ${notRecognizedBanks.join(", ")}`);

  const result = await getSimulationsController({
    bancos,
    service: {
      name: "listVehicles",
      input: { cpf },
    },
  });
  res.json({ result });
});

app.listen(5000, async () => {
  await redis.connect().catch(() => {});
  console.log("Listening on http://localhost:5000");
});
