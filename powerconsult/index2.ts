// login-flow.ts

// Execução
(async () => {
  try {
    const accessToken = await getAccessToken();
    accessTokenGlobal = accessToken;

    const apiUrl =
      "https://apicd.cloud.itau.com.br/charon/brr13ot8/9fecca81a835b498";

    const payload: ApiPayload = {
      sellerDocument: "45494125000153",
      statusAnalysis: "RED",
      segment: null,
      dismissalCnhEnable: true,
      clientDocument: "72048255191",
      customer: false,
    };

    const apiRes = await fetch(apiUrl, {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify(payload),
    });

    const apiResult = await apiRes.json().catch(() => ({}));

    console.log("\n✅ Resposta da API:");
    console.log("Status:", apiRes.status);
    console.log("Body:", apiResult);
  } catch (err) {
    console.error("Erro:", err);
    process.exit(1);
  }
})();
