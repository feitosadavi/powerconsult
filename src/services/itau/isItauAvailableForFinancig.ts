import { redis } from "../../config/redis";
import {
  CHARON_SESSION,
  ITAU_TOKEN,
  ITAU_URLS,
  ITAU_URLS_CHARON,
} from "../../constants";
import { SimulationInput, SimulationOutput } from "../../domain";
import { logger } from "../../lib";
import { getAccessToken } from "./auth";
import { getHeaders } from "./config";
import { getCharonSession } from "./getCharonSession";

export default async function isItauAvailableForFinancing({
  cpf,
}: SimulationInput): Promise<SimulationOutput> {
  try {
    const token = await getAccessToken();

    let { preAnalysisUrl, preAnalysis, vehicleYears, charon } =
      await getCharonSession(token, cpf);

    const {
      token: { accessToken },
    } = await getAccessToken();

    if (!preAnalysis) {
      preAnalysis = await getPreAnalysis({
        accessToken,
        url: preAnalysisUrl,
        cpf,
        charonSession: charon,
      });
    }

    return {
      itau: {
        success: {
          financing: preAnalysis.statusAnalysis === "GREEN",
          vehicleYears: vehicleYears,
        },
      },
    };
  } catch (error) {
    console.error(error);
    redis.del(CHARON_SESSION);
    redis.del(ITAU_TOKEN);
    return await isItauAvailableForFinancing({ cpf });
  }
}
// try {

//   const itauUrlCharons = await getItauUrlsCharon();
//   const { preAnalysisCharon, preAnalysisUrl, getVehicleYearsUrl } =
//     await getItauUrls({
//       accessToken: accessToken,
//       charonSession: itauUrlCharons,
//     });

//   logger("-> itau fetching vehicle years");
//   const vehicleYears = await getVehicleYears({
//     accessToken,
//     url: preAnalysisUrl,
//     charonSession: preAnalysisCharon,
//   });

//   return {
//     itau: {
//       success: {
//         financing: preAnaliysResult.statusAnalysis === "GREEN",
//         vehicleYears: vehicleYears,
//       },
//     },
//   };
// } catch (error) {
//   console.error(error);
//   await redis.del(ITAU_URLS);
//   await redis.del(ITAU_URLS_CHARON);
//   await new Promise((resolve) => setTimeout(resolve, 3000));

//   const res = await isItauAvailableForFinancing({ cpf });
//   return res;
// }

const getVehicleYears = async ({
  url,
  accessToken,
  charonSession,
}: {
  url: string;
  accessToken: string;
  charonSession: string;
}) => {
  logger("-> itau fetching getVehicleYears");
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders({
      accessToken,
      charonSession,
    }),
  });

  if (response.status !== 200) throw new Error("Forbidden");
  else return response.json();
};

const getPreAnalysis = async ({
  url,
  accessToken,
  charonSession,
  cpf,
}: {
  url: string;
  accessToken: string;
  charonSession: string;
  cpf: string;
}) => {
  logger("-> itau fetching preAnalysis");

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders({
      accessToken,
      charonSession,
    }),
    body: JSON.stringify({
      sellerDocument: "45494125000153",
      clientDocument: cpf,
    }),
  });
  if (response.status !== 200) throw new Error("Forbidden");
  else return response.json();
};

const getItauUrls = async ({
  accessToken,
  charonSession,
}: {
  accessToken: string;
  charonSession: string;
}) => {
  logger("-=-=-=-= itau getting itau urls -=-=-=-=");
  logger("-> itau checking cache");
  const cache = await redis.get(ITAU_URLS);
  if (cache) {
    logger("-> itau has cache");
    return JSON.parse(cache);
  }

  logger("-> itau fetching urls");
  const itauUrlsResponse = await fetch(
    "https://apicd.cloud.itau.com.br/charon/brr13ot8/",
    {
      method: "GET",
      headers: getHeaders({
        accessToken,
        charonSession,
      }),
    }
  );
  console.log(itauUrlsResponse);

  if (itauUrlsResponse.status !== 200) throw new Error("ITAU_URLS ERROR");

  const itauUrls = await itauUrlsResponse.json().catch(() => ({}));

  const [getVehicleYearsUrl, preAnalysisUrl] = itauUrls.links
    .filter((link: any) =>
      ["getVehicleYears", "preAnalysis"].includes(link.rel)
    )
    .map((data: any) => data.href);

  const preAnalysisCharon = itauUrlsResponse.headers.get("x-charon-session");

  if (preAnalysisCharon) {
    logger("-> itau fetching returned preAnalysisCharon");

    await redis.set(
      ITAU_URLS_CHARON,
      JSON.stringify({
        preAnalysisUrl,
        getVehicleYearsUrl,
        preAnalysisCharon,
      })
    );

    return {
      preAnalysisUrl,
      getVehicleYearsUrl,
      preAnalysisCharon,
    };
  } else throw new Error("PRE_ANALYSIS_CHARON NOT FOUND");
};

const getItauUrlsCharon = async () => {
  logger("-=-=-=-= itau getting itau urls charon -=-=-=-=");
  logger("-=-=-=-= checking cache -=-=-=-=");

  const charon = await redis.get(ITAU_URLS_CHARON);
  if (charon) {
    logger("-=-=-=-= has cache -=-=-=-=");
    return charon;
  }

  logger("-> itau fetching");
  const apiRes2 = await fetch(
    "https://apicd.cloud.itau.com.br/iske?charonId=yqb8zx5w",
    {
      method: "POST",
      headers: getHeaders({ octet: true }),
      body: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8s8G3NmlgyY2DxsAUjDUOS4n/AuXbw+bm1LyObFsVI/QgX9+xvxbeOtyv6brP8rxNX7gRz/DIEwu7qTZAs+MqyKRZ2c4a/2RkWt6Y5aJyQtjmfu1wzziGeTL5RixCjU/F6BcGF8sLRoaQ0EzXBzQDmH3siZ9VtcRWcJGopmLQt9Wv1PWbtRi/W7aJ09mmKNzTWoaxExd4Yj8KttNWclt4O6qQxj76+ccxQxU3IbwPhyo6xNbXjrPnQ99Pyw6GtaWb8IFgA+wBnjVJtGoJS0Ei6iHrfgQUV5aGGHL44E9e1p1bR2jWHE9SFkFDvZNTQYSSOeP8XpFkYDHfDwHW0EMVwIDAQAB",
    }
  );
  const reqCharon = apiRes2.headers.get("x-charon-session");

  if (reqCharon) {
    logger("-> itau fetching returned charon");

    await redis.set(ITAU_URLS_CHARON, reqCharon);
    return reqCharon;
  } else throw new Error("GET_ITAU_URL_CHARON NOT FOUND");
};
