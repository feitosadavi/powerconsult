import { ServiceOutput } from "../banks";
import { headers } from "../config";
import { ServiceInput } from "../domain";
import { customFetch, logger } from "../lib";

const BASE_URL = "https://ap-gateway-web.bancopan.com.br/prd/veiculos";

export async function bancopanService({
  cpf,
}: ServiceInput): Promise<ServiceOutput> {
  const token = await login();

  const simulations = await getSimulation(token.results.access_token, cpf);

  // const simulations = ids.map(async (id) => await getSimulation(id));

  return { bancopan: simulations };
}

export async function getSimulation(token: any, cpf: string): Promise<{}> {
  logger("Getting simulations");

  const data = await customFetch(
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
    username: "66956463172",
    password: "Feroz2025*",
    persist: false,
    changePassword: false,
  };

  const data = await customFetch(`${BASE_URL}/autenticacao/v3/v2/oauth/token`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  return data;
}
