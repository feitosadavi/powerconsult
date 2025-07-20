import { BANKS, ServiceOutput } from "../banks";
import { generateHeaders } from "../config";
import { ServiceInput } from "../domain";
import { customFetch, logger } from "../lib";
import forge from "node-forge";
import FormData from "form-data";
import { chromium } from "playwright";

const BASE_URL = "https://wwwsn.bradescofinanciamentos.com.br";
const headers = generateHeaders({
  Host: "wwwsn.bradescofinanciamentos.com.br",
  Origin: "https://wwwsn.bradescofinanciamentos.com.br",
  Referer: "https://wwwsn.bradescofinanciamentos.com.br/finilojmobile/",
});

// Função auxiliar para delay aleatório
function randomDelay(min = 100, max = 250) {
  return new Promise((res) =>
    setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min)
  );
}

// Função para digitação simulando humano
async function typeLikeHuman(
  page: any,
  selector: string,
  text: string,
  min = 100,
  max = 200
) {
  for (const char of text) {
    await page.type(selector, char);
    await randomDelay(min, max);
  }
}

export async function bradescoService({
  cpf,
}: ServiceInput): Promise<ServiceOutput> {
  const { authorization, dsToken } = await login();
  const simulations = await getSimulation({ authorization, dsToken }, cpf);
  return { bradesco: simulations };
}

export async function getSimulation(
  { authorization, dsToken }: any,
  cpf: string
): Promise<{}> {
  logger("Getting simulations");

  const data = await customFetch<any>(
    `https://proxy.api.banco.bradesco/v1/financiamento/bff/portal/gerenciar?ep=localizar-proposta-simulacao${cpf}`,
    {
      method: "POST",
      body: JSON.stringify({
        buscaProposta: "03624797123",
        tipoBuscaProposta: "CPF",
      }),
      headers: {
        ...headers,
        Host: "proxy.api.banco.bradesco",
        Origin: "https://veiculos.financiamentos.bradesco",
        Referer: "https://veiculos.financiamentos.bradesco/",
        "access-token": dsToken,
        Authorization: `Bearer ${authorization}`,
      },
    }
  );

  return data.results;
}

const publicKeyPem = `-----BEGIN RSA PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnRPaep06v6hudiGQFCK+RzXC3aq2+fscamPhDw+EGthlsBquEGew82crwEhubf8o1e+0I5KxXYK6PjnnDidokjX1pFdM6sNGaCOmI0pP4zKPa7pPZ81EVc4ynvSaArwixpmS+cuN56Hrq6LkjCnyw/NECUeaTc9aMUdIT6qKlCn/GM3voVIceLch/4/s/9r/SLcVR8ly/eQg7wyjbhPg4FdN+IdfRbp7RkpDq4SxQo98mEEJhcx+6mcGq3XdMy+dYuDeuXGUtCFHpiC3CUuVLu6EQqxIKTfnlQKFBurOtFuu2ONcnEsszp4A3dVqNsvxcZhiLq7ahgUtrSEZZwZBhwIDAQAB
-----END RSA PUBLIC KEY-----`;

function generateEncryptedHash({
  nomeUsuario,
  senhaUsuario,
  tipoLogin = "P",
}: any) {
  logger("Gerando hash");
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const json = JSON.stringify({ nomeUsuario, senhaUsuario, tipoLogin });
  const encrypted = publicKey.encrypt(json, "RSAES-PKCS1-V1_5");
  const base64 = forge.util.encode64(encrypted);
  return base64;
}

async function login() {
  logger("Login - Bradesco");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://brpioneer.accenture.com/originacao-auto/login");

  await page.waitForSelector("#mat-input-0");

  // CPF e senha simulando digitação humana
  await typeLikeHuman(page, "#mat-input-0", "017.322.843-77");
  await randomDelay(300, 800);
  await typeLikeHuman(page, "#mat-input-1", "Power31$");

  await randomDelay(500, 1500);
  await page.click('button:has-text("Entrar")');

  await page.waitForTimeout(5000); // ou await page.waitForNavigation() se necessário

  await browser.close();

  return {
    authorization: "",
    dsToken: "",
  };
}
