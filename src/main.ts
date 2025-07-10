import express, { json } from "express";
import {
  getSimulationsController,
  GetSimulationsController,
} from "./controllers";
import { AvailableBanks } from "./banks";

const app = express();
app.use(json());

app.post("/simular", async (req, res) => {
  const { bancos, cpf } = req.body;
  if (!(bancos && cpf)) res.status(400).json("bancos or cpf faltando");

  const notRecognizedBanks = (bancos as string[]).filter(
    (banco: string) => banco in AvailableBanks
  );

  if (notRecognizedBanks.length > 0)
    res
      .status(400)
      .json(`bancos não reconhecidos: ${notRecognizedBanks.join(", ")}`);

  const result = getSimulationsController({ bancos, cpf });
  res.json({ result });
});

app.listen(5000, () => {
  console.log("Listening on http://localhost:5000");
});
