import { BANKS } from "../banks";
import { generateHeaders } from "../config";
import { SimulationInput, SimulationOutput } from "../domain";
import { customFetch, logger } from "../lib";

const BASE_URL = "https://ap-gateway-web.bancopan.com.br/prd/veiculos";
const headers = generateHeaders({
  Host: "ap-gateway-web.bancopan.com.br",
  Origin: "https://veiculos.bancopan.com.br",
  Referer: "https://veiculos.bancopan.com.br/",
});

export async function bancopanService({
  cpf,
}: SimulationInput): Promise<SimulationOutput> {
  const token = await login();

  const simulations = await getSimulation(token.results.access_token, cpf);

  // const simulations = ids.map(async (id) => await getSimulation(id));

  return { bancopan: simulations };
}

export async function getSimulation(token: any, cpf: string): Promise<{}> {
  logger("Getting simulations");

  const data = await customFetch<any>(
    `https://ap-gateway-web.bancopan.com.br/prd/veiculos/simulacao/v3/simulacao/loja/122464/cliente/${cpf}`,
    {
      method: "GET",
      headers: {
        ...headers,
        Cookie: token,
        authorization: `Bearer ${token}`,
      },
    }
  );

  return data.results;
}

// export async function getSimulation(
//   access_token: string,
//   id: string
// ): Promise<any> {
//   const data = await customFetch(
//     `${BASE_URL}/simulacao/v3/simulacao-veiculo/proposta/${id}?context=COMPARADOR`,
//     {
//       method: "GET",
//       headers: {
//         ...headers,
//         Cookie: access_token,
//         authorization: `Bearer ${access_token}`,
//       },
//     }
//   );
//   return data;
// }

async function login() {
  logger("Login");

  const payload = {
    grant_type: "password",
    response_type: "id_token",
    ...BANKS.bancopan.creds,
    persist: false,
    changePassword: false,
  };

  const data = await customFetch<any>(
    `${BASE_URL}/autenticacao/v3/v2/oauth/token`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }
  );

  return data;
}
