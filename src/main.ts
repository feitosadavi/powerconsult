import express, { json } from "express";
import { getSimulationsController } from "./controllers";
import { availableBanksList } from "./domain";

const app = express();
app.use(json());

app.post("/availableBanks", async (req, res) => {
  const { bancos, cpf } = req.body;
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
    cpf,
    checkFinancingAvailability: true,
  });

  res.json({ result });
});

app.post("/simular", async (req, res) => {
  const { bancos, cpf } = req.body;
  if (!(bancos && cpf)) res.status(400).json("bancos or cpf faltando");

  const notRecognizedBanks = (bancos as string[]).filter(
    (banco: string) => banco in availableBanksList
  );

  if (notRecognizedBanks.length > 0)
    res
      .status(400)
      .json(`bancos não reconhecidos: ${notRecognizedBanks.join(", ")}`);

  const result = await getSimulationsController({ bancos, cpf });

  res.json({ result });
});

app.listen(5000, () => {
  console.log("Listening on http://localhost:5000");
});
