export const getHeaders = ({
  accessToken,
  charonSession,
  octet,
}: {
  accessToken?: string;
  charonSession?: string;
  octet?: boolean;
}) => ({
  Host: "apicd.cloud.itau.com.br",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",

  Accept: "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.5",

  Authorization: `Bearer ${accessToken ?? ""}`,
  "x-charon-session": charonSession ?? "",

  // ⚡️ estes podem ser gerados dinamicamente (UUID) no futuro, se necessário
  "x-itau-apikey":
    "bd0fb09f0179b8d899bd7be7404158bd0713462fc9bc1a88723de71e896de0e0501528201882cd5e7dc1fd9115725833",
  "x-apigw-api-id": "v0vb31ek5l",
  "x-itau-correlationID": "1b6fc86c-aad5-47f0-b690-59129efd9f28",
  "x-itau-flowID": "c41b1314-e45a-43a4-b788-f2ab938f54ec",

  "Content-Type": octet ? "application/octet-stream" : "application/json",

  Origin: "https://www.credlineitau.com.br",
  Referer: "https://www.credlineitau.com.br/",

  Connection: "keep-alive",
  Priority: "u=0",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
  TE: "trailers",
});
